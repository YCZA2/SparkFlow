import { useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { requestAiEdit, updateFragment, uploadImageAsset } from '@/features/fragments/api';
import {
  applyAiPatch,
  buildImageNode,
  collectDocumentAssetIds,
  emptyEditorDocument,
  normalizeEditorDocument,
  normalizeSelectionRange,
} from '@/features/fragments/editorDocument';
import {
  clearFragmentBodyDraft,
  loadFragmentBodyDraft,
  saveFragmentBodyDraft,
} from '@/features/fragments/bodyDrafts';
import type {
  EditorDocument,
  EditorNode,
  EditorSelectionRange,
  Fragment,
  FragmentAiPatch,
} from '@/types/fragment';
import type { FragmentRichEditorHandle } from '@/features/fragments/components/FragmentRichEditor';

const AUTOSAVE_DELAY_MS = 800;

type SyncStatus = 'idle' | 'syncing' | 'synced';

interface UseFragmentRichEditorOptions {
  fragment: Fragment | null;
  onFragmentChange: (fragment: Fragment) => void;
}

function resolveInitialDocument(fragment: Fragment | null): EditorDocument {
  /** 中文注释：正文编辑器优先使用服务端富文本正文，没有时回退为空文档。 */
  if (!fragment) return emptyEditorDocument();
  return normalizeEditorDocument(fragment.editor_document);
}

function serializeDocument(document: EditorDocument): string {
  /** 中文注释：统一文档序列化口径，避免保存态与草稿态比较不一致。 */
  return JSON.stringify(normalizeEditorDocument(document));
}

export function useFragmentRichEditor({ fragment, onFragmentChange }: UseFragmentRichEditorOptions) {
  /** 中文注释：管理 ProseMirror 正文、本地草稿、自动保存、图片插入和 AI patch。 */
  const [document, setDocument] = useState<EditorDocument>(emptyEditorDocument());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [selectionRange, setSelectionRange] = useState<EditorSelectionRange | null>(null);
  const [selectionText, setSelectionText] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedDocumentRef = useRef<EditorDocument | null>(null);
  const lastSyncedDocumentRef = useRef<string>('');
  const editorRef = useRef<FragmentRichEditorHandle | null>(null);
  const hydratedFragmentIdRef = useRef<string | null>(null);

  const fragmentId = fragment?.id ?? null;
  const initialDocument = resolveInitialDocument(fragment);
  const visibleDocument = isDraftHydrated ? document : initialDocument;
  const attachedMediaAssetIds = useMemo(() => collectDocumentAssetIds(visibleDocument), [visibleDocument]);

  useEffect(() => {
    /** 中文注释：仅在切换到新的 fragment 时恢复草稿，避免保存回写触发重复初始化。 */
    if (!fragmentId) {
      hydratedRef.current = false;
      setDocument(emptyEditorDocument());
      setSelectionRange(null);
      setSelectionText('');
      setSyncStatus('idle');
      setIsEditorReady(false);
      setIsDraftHydrated(false);
      lastSyncedDocumentRef.current = '';
      hydratedFragmentIdRef.current = null;
      return;
    }
    if (hydratedFragmentIdRef.current === fragmentId) return;
    hydratedFragmentIdRef.current = fragmentId;
    const nextInitialDocument = resolveInitialDocument(fragment);
    setDocument(nextInitialDocument);
    setSelectionRange(null);
    setSelectionText('');
    setIsDraftHydrated(false);
    let cancelled = false;
    void (async () => {
      const draft = await loadFragmentBodyDraft(fragmentId);
      if (cancelled) return;
      const nextDocument = normalizeEditorDocument((draft as EditorDocument | null) ?? nextInitialDocument);
      hydratedRef.current = true;
      lastSyncedDocumentRef.current = serializeDocument(nextInitialDocument);
      setDocument(nextDocument);
      setSelectionRange(null);
      setSelectionText('');
      setIsDraftHydrated(true);
      setSyncStatus(serializeDocument(nextDocument) === serializeDocument(nextInitialDocument) ? 'synced' : 'idle');
    })();
    return () => {
      cancelled = true;
    };
  }, [fragmentId]);

  useEffect(() => {
    /** 中文注释：正文变更后先写本地文档草稿，保证失败或离页可恢复。 */
    if (!fragmentId || !hydratedRef.current) return;
    const serialized = serializeDocument(document);
    if (serialized === lastSyncedDocumentRef.current) return;
    void saveFragmentBodyDraft(fragmentId, document).catch(() => undefined);
  }, [document, fragmentId]);

  useEffect(() => {
    /** 中文注释：输入停顿后自动向服务端提交最新正文文档。 */
    if (!fragmentId || !fragment || !hydratedRef.current) return;
    const serialized = serializeDocument(document);
    if (serialized === lastSyncedDocumentRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void submitLatestDocument(document);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [document, fragment, fragmentId]);

  async function submitLatestDocument(nextDocument: EditorDocument): Promise<void> {
    /** 中文注释：串行化正文保存请求，只保留最后一次文档状态。 */
    if (!fragmentId) return;
    const serialized = serializeDocument(nextDocument);
    if (serialized === lastSyncedDocumentRef.current) return;
    if (inFlightRef.current) {
      queuedDocumentRef.current = nextDocument;
      return;
    }
    inFlightRef.current = true;
    setSyncStatus('syncing');
    try {
      const updated = await updateFragment(fragmentId, {
        editor_document: nextDocument,
        media_asset_ids: collectDocumentAssetIds(nextDocument),
      });
      onFragmentChange(updated);
      lastSyncedDocumentRef.current = serializeDocument(updated.editor_document);
      await clearFragmentBodyDraft(fragmentId);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('idle');
    } finally {
      inFlightRef.current = false;
      const queuedDocument = queuedDocumentRef.current;
      queuedDocumentRef.current = null;
      if (queuedDocument && serializeDocument(queuedDocument) !== lastSyncedDocumentRef.current) {
        void submitLatestDocument(queuedDocument);
      }
    }
  }

  function updateDocument(nextDocument: EditorDocument): void {
    /** 中文注释：同步更新文档状态，并在已同步状态下重新标记为待保存。 */
    setDocument(normalizeEditorDocument(nextDocument));
    if (syncStatus === 'synced') setSyncStatus('idle');
  }

  function updateSelection(range: EditorSelectionRange | null, text: string): void {
    /** 中文注释：同步记录当前选区快照，供 AI patch 和图片插入复用。 */
    setSelectionRange(normalizeSelectionRange(range));
    setSelectionText(text.trim());
  }

  async function pickAndInsertImage(): Promise<void> {
    /** 中文注释：从系统文件选择器选图、上传并插入正文。 */
    try {
      setIsUploadingImage(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      const uploaded = await uploadImageAsset(
        asset.uri,
        asset.name ?? 'image.jpg',
        asset.mimeType ?? 'image/jpeg'
      );
      const imageNode = buildImageNode(uploaded);
      editorRef.current?.insertImage(imageNode);
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function runAiAction(instruction: 'polish' | 'shorten' | 'expand' | 'title' | 'script_seed'): Promise<void> {
    /** 中文注释：请求后端生成 patch，并直接应用到当前编辑器。 */
    if (!fragmentId) return;
    try {
      setIsAiRunning(true);
      const response = await requestAiEdit(fragmentId, {
        editor_document: document,
        instruction,
        selection_text: selectionText || undefined,
        selection_range: selectionRange,
      });
      applyPatchToEditor(response.patch);
    } finally {
      setIsAiRunning(false);
    }
  }

  function applyPatchToEditor(patch: FragmentAiPatch): void {
    /** 中文注释：优先通过编辑器实例应用 patch，桥接不可用时再回退到本地文档。 */
    if (isEditorReady) {
      editorRef.current?.applyPatch(patch);
      return;
    }
    updateDocument(applyAiPatch(document, patch));
  }

  function handleEditorReady(): void {
    /** 中文注释：记录 DOM 编辑器就绪状态，便于走桥接命令。 */
    setIsEditorReady(true);
  }

  return {
    editorRef,
    document: visibleDocument,
    attachedMediaAssetIds,
    statusLabel: syncStatus === 'syncing' ? '同步中' : syncStatus === 'synced' ? '已同步' : null,
    isUploadingImage,
    isAiRunning,
    onEditorReady: handleEditorReady,
    onDocumentChange: updateDocument,
    onSelectionChange: updateSelection,
    onInsertImage: pickAndInsertImage,
    onAiAction: runAiAction,
  };
}
