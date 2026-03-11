import { useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { requestAiEdit, updateFragment, uploadImageAsset } from '@/features/fragments/api';
import {
  applyAiPatch,
  collectDocumentAssetIds,
  emptyEditorDocument,
  insertImageBlock,
  normalizeEditorDocument,
} from '@/features/fragments/editorDocument';
import {
  clearFragmentBodyDraft,
  loadFragmentBodyDraft,
  saveFragmentBodyDraft,
} from '@/features/fragments/bodyDrafts';
import type { EditorDocument, Fragment } from '@/types/fragment';

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

export function useFragmentRichEditor({ fragment, onFragmentChange }: UseFragmentRichEditorOptions) {
  /** 中文注释：管理富文本正文、本地草稿、自动保存、图片插入和 AI patch。 */
  const [document, setDocument] = useState<EditorDocument>(emptyEditorDocument());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedDocumentRef = useRef<EditorDocument | null>(null);
  const lastSyncedDocumentRef = useRef<string>('');

  const fragmentId = fragment?.id ?? null;
  const initialDocument = useMemo(() => resolveInitialDocument(fragment), [fragment]);
  const attachedMediaAssetIds = useMemo(() => collectDocumentAssetIds(document), [document]);

  useEffect(() => {
    /** 中文注释：切换 fragment 时优先恢复本地草稿文档。 */
    if (!fragmentId) {
      hydratedRef.current = false;
      setDocument(emptyEditorDocument());
      setActiveBlockId(null);
      setSyncStatus('idle');
      lastSyncedDocumentRef.current = '';
      return;
    }
    let cancelled = false;
    void (async () => {
      const draft = await loadFragmentBodyDraft(fragmentId);
      if (cancelled) return;
      const nextDocument = normalizeEditorDocument((draft as EditorDocument | null) ?? initialDocument);
      hydratedRef.current = true;
      lastSyncedDocumentRef.current = JSON.stringify(initialDocument);
      setDocument(nextDocument);
      setActiveBlockId(nextDocument.blocks[0]?.id ?? null);
      setSyncStatus(JSON.stringify(nextDocument) === JSON.stringify(initialDocument) ? 'synced' : 'idle');
    })();
    return () => {
      cancelled = true;
    };
  }, [fragmentId, initialDocument]);

  useEffect(() => {
    /** 中文注释：正文变更后先写本地文档草稿，保证失败或离页可恢复。 */
    if (!fragmentId || !hydratedRef.current) return;
    const serialized = JSON.stringify(document);
    if (serialized === lastSyncedDocumentRef.current) return;
    void saveFragmentBodyDraft(fragmentId, document).catch(() => undefined);
  }, [document, fragmentId]);

  useEffect(() => {
    /** 中文注释：输入停顿后自动向服务端提交最新正文文档。 */
    if (!fragmentId || !fragment || !hydratedRef.current) return;
    const serialized = JSON.stringify(document);
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
    const serialized = JSON.stringify(nextDocument);
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
      lastSyncedDocumentRef.current = JSON.stringify(normalizeEditorDocument(updated.editor_document));
      await clearFragmentBodyDraft(fragmentId);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('idle');
    } finally {
      inFlightRef.current = false;
      const queuedDocument = queuedDocumentRef.current;
      queuedDocumentRef.current = null;
      if (queuedDocument && JSON.stringify(queuedDocument) !== lastSyncedDocumentRef.current) {
        void submitLatestDocument(queuedDocument);
      }
    }
  }

  function updateDocument(nextDocument: EditorDocument): void {
    /** 中文注释：同步更新文档状态，并在已同步状态下重新标记为待保存。 */
    setDocument(normalizeEditorDocument(nextDocument));
    if (syncStatus === 'synced') setSyncStatus('idle');
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
      updateDocument(insertImageBlock(document, uploaded, activeBlockId));
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function runAiAction(instruction: 'polish' | 'shorten' | 'expand' | 'title' | 'script_seed'): Promise<void> {
    /** 中文注释：请求后端生成 patch，并直接应用到本地正文。 */
    if (!fragmentId) return;
    try {
      setIsAiRunning(true);
      const activeBlock = document.blocks.find((block) => block.id === activeBlockId);
      const selectionText = activeBlock && activeBlock.type !== 'image'
        ? activeBlock.children.map((child) => child.text).join('').trim()
        : undefined;
      const response = await requestAiEdit(fragmentId, {
        editor_document: document,
        instruction,
        selection_text: selectionText,
        target_block_id: activeBlockId,
      });
      updateDocument(applyAiPatch(document, response.patch));
    } finally {
      setIsAiRunning(false);
    }
  }

  return {
    document,
    activeBlockId,
    attachedMediaAssetIds,
    statusLabel: syncStatus === 'syncing' ? '同步中' : syncStatus === 'synced' ? '已同步' : null,
    isUploadingImage,
    isAiRunning,
    setActiveBlockId,
    onChangeDocument: updateDocument,
    onInsertImage: pickAndInsertImage,
    onAiAction: runAiAction,
  };
}
