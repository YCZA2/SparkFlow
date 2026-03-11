import { useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { requestAiEdit, updateFragment, uploadImageAsset } from '@/features/fragments/api';
import {
  applyAiPatchToMarkdown,
  extractAssetIdsFromMarkdown,
  extractPlainTextFromMarkdown,
  normalizeBodyMarkdown,
} from '@/features/fragments/bodyMarkdown';
import {
  clearFragmentBodyDraft,
  loadFragmentBodyDraft,
  saveFragmentBodyDraft,
} from '@/features/fragments/bodyDrafts';
import type {
  Fragment,
  FragmentAiPatch,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';
import type { FragmentRichEditorHandle } from '@/features/fragments/components/FragmentRichEditor';

const AUTOSAVE_DELAY_MS = 800;

type SyncStatus = 'idle' | 'syncing' | 'synced';

interface UseFragmentRichEditorOptions {
  fragment: Fragment | null;
  onFragmentChange: (fragment: Fragment) => void;
}

function resolveInitialMarkdown(fragment: Fragment | null): string {
  /** 中文注释：正文编辑器优先使用服务端 Markdown，没有时回退为空字符串。 */
  return normalizeBodyMarkdown(fragment?.body_markdown);
}

function buildSnapshot(markdown: string): FragmentEditorSnapshot {
  /** 中文注释：统一构造编辑器快照，避免各处重复提取纯文本和素材引用。 */
  const normalized = normalizeBodyMarkdown(markdown);
  return {
    body_markdown: normalized,
    plain_text: extractPlainTextFromMarkdown(normalized),
    asset_ids: extractAssetIdsFromMarkdown(normalized),
  };
}

export function useFragmentRichEditor({ fragment, onFragmentChange }: UseFragmentRichEditorOptions) {
  /** 中文注释：管理 Markdown 正文、本地草稿、自动保存、图片插入和 AI patch。 */
  const [snapshot, setSnapshot] = useState<FragmentEditorSnapshot>(buildSnapshot(''));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [selectionText, setSelectionText] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [formattingState, setFormattingState] = useState<FragmentEditorFormattingState | null>(null);
  const [editorKey, setEditorKey] = useState('empty');
  const [runtimeMediaAssets, setRuntimeMediaAssets] = useState<MediaAsset[]>([]);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedSnapshotRef = useRef<FragmentEditorSnapshot | null>(null);
  const lastSyncedMarkdownRef = useRef('');
  const editorRef = useRef<FragmentRichEditorHandle | null>(null);
  const hydratedFragmentIdRef = useRef<string | null>(null);

  const fragmentId = fragment?.id ?? null;
  const initialMarkdown = resolveInitialMarkdown(fragment);
  const visibleMediaAssets = useMemo(() => {
    const merged = [...(fragment?.media_assets ?? [])];
    for (const asset of runtimeMediaAssets) {
      if (!merged.some((item) => item.id === asset.id)) merged.push(asset);
    }
    return merged;
  }, [fragment?.media_assets, runtimeMediaAssets]);

  useEffect(() => {
    /** 中文注释：服务端返回更新后的素材列表时覆盖本地视图，避免详情抽屉拿到旧签名地址。 */
    if (!fragment?.media_assets) return;
    setRuntimeMediaAssets(fragment.media_assets);
  }, [fragment?.media_assets]);

  useEffect(() => {
    /** 中文注释：仅在切换到新的 fragment 时恢复 Markdown 草稿，避免保存回写触发重复初始化。 */
    if (!fragmentId) {
      hydratedRef.current = false;
      setSnapshot(buildSnapshot(''));
      setSelectionText('');
      setSyncStatus('idle');
      setIsEditorReady(false);
      setIsDraftHydrated(false);
      setFormattingState(null);
      setRuntimeMediaAssets([]);
      setEditorKey('empty');
      lastSyncedMarkdownRef.current = '';
      hydratedFragmentIdRef.current = null;
      return;
    }
    if (hydratedFragmentIdRef.current === fragmentId) return;
    hydratedFragmentIdRef.current = fragmentId;
    setSelectionText('');
    setIsDraftHydrated(false);
    setRuntimeMediaAssets(fragment?.media_assets ?? []);
    let cancelled = false;
    void (async () => {
      const draft = await loadFragmentBodyDraft(fragmentId);
      if (cancelled) return;
      const nextMarkdown = normalizeBodyMarkdown(draft ?? initialMarkdown);
      const nextSnapshot = buildSnapshot(nextMarkdown);
      hydratedRef.current = true;
      lastSyncedMarkdownRef.current = normalizeBodyMarkdown(initialMarkdown);
      setSnapshot(nextSnapshot);
      setSyncStatus(nextSnapshot.body_markdown === lastSyncedMarkdownRef.current ? 'synced' : 'idle');
      setIsDraftHydrated(true);
      setFormattingState(null);
      setEditorKey(`${fragmentId}:${Date.now()}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [fragment?.media_assets, fragmentId, initialMarkdown]);

  useEffect(() => {
    /** 中文注释：正文变更后先写本地 Markdown 草稿，保证失败或离页可恢复。 */
    if (!fragmentId || !hydratedRef.current) return;
    if (snapshot.body_markdown === lastSyncedMarkdownRef.current) return;
    void saveFragmentBodyDraft(fragmentId, snapshot.body_markdown).catch(() => undefined);
  }, [fragmentId, snapshot.body_markdown]);

  useEffect(() => {
    /** 中文注释：输入停顿后自动向服务端提交最新 Markdown 正文。 */
    if (!fragmentId || !fragment || !hydratedRef.current) return;
    if (snapshot.body_markdown === lastSyncedMarkdownRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const latestSnapshot = editorRef.current?.getSnapshot() ?? snapshot;
      void submitLatestSnapshot(latestSnapshot);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [fragment, fragmentId, snapshot]);

  async function submitLatestSnapshot(nextSnapshot: FragmentEditorSnapshot): Promise<void> {
    /** 中文注释：串行化正文保存请求，只保留最后一次 Markdown 快照。 */
    if (!fragmentId) return;
    const normalizedMarkdown = normalizeBodyMarkdown(nextSnapshot.body_markdown);
    if (normalizedMarkdown === lastSyncedMarkdownRef.current) return;
    if (inFlightRef.current) {
      queuedSnapshotRef.current = nextSnapshot;
      return;
    }
    inFlightRef.current = true;
    setSyncStatus('syncing');
    try {
      const updated = await updateFragment(fragmentId, {
        body_markdown: normalizedMarkdown,
        media_asset_ids: nextSnapshot.asset_ids,
      });
      onFragmentChange(updated);
      setRuntimeMediaAssets(updated.media_assets ?? []);
      lastSyncedMarkdownRef.current = normalizeBodyMarkdown(updated.body_markdown);
      await clearFragmentBodyDraft(fragmentId);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('idle');
    } finally {
      inFlightRef.current = false;
      const queuedSnapshot = queuedSnapshotRef.current;
      queuedSnapshotRef.current = null;
      if (
        queuedSnapshot &&
        normalizeBodyMarkdown(queuedSnapshot.body_markdown) !== lastSyncedMarkdownRef.current
      ) {
        void submitLatestSnapshot(queuedSnapshot);
      }
    }
  }

  function handleSnapshotChange(nextSnapshot: FragmentEditorSnapshot): void {
    /** 中文注释：同步记录 DOM 编辑器的节流快照，并在已同步状态下重新标记待保存。 */
    setSnapshot({
      body_markdown: normalizeBodyMarkdown(nextSnapshot.body_markdown),
      plain_text: nextSnapshot.plain_text,
      asset_ids: nextSnapshot.asset_ids,
    });
    if (syncStatus === 'synced') setSyncStatus('idle');
  }

  function handleSelectionChange(text: string): void {
    /** 中文注释：同步记录当前选中文本，供 AI patch 复用。 */
    setSelectionText(text.trim());
  }

  function handleFormattingStateChange(nextState: FragmentEditorFormattingState): void {
    /** 中文注释：保存工具栏状态，驱动原生页的格式按钮高亮。 */
    setFormattingState(nextState);
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
      setRuntimeMediaAssets((current) => {
        if (current.some((item) => item.id === uploaded.id)) return current;
        return [...current, uploaded];
      });
      editorRef.current?.insertImage(uploaded);
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function runAiAction(instruction: 'polish' | 'shorten' | 'expand' | 'title' | 'script_seed'): Promise<void> {
    /** 中文注释：请求后端生成 Markdown patch，并直接应用到当前编辑器。 */
    if (!fragmentId) return;
    try {
      setIsAiRunning(true);
      const latestSnapshot = editorRef.current?.getSnapshot() ?? snapshot;
      const response = await requestAiEdit(fragmentId, {
        body_markdown: latestSnapshot.body_markdown,
        instruction,
        selection_text: selectionText || undefined,
      });
      applyPatchToEditor(response.patch);
    } finally {
      setIsAiRunning(false);
    }
  }

  function applyPatchToEditor(patch: FragmentAiPatch): void {
    /** 中文注释：优先通过编辑器实例应用 patch，桥接不可用时再回退到本地 Markdown。 */
    if (isEditorReady) {
      editorRef.current?.applyPatch(patch);
      return;
    }
    const nextMarkdown = applyAiPatchToMarkdown(snapshot.body_markdown, patch, selectionText);
    handleSnapshotChange(buildSnapshot(nextMarkdown));
  }

  function handleEditorReady(): void {
    /** 中文注释：记录 DOM 编辑器就绪状态，便于走桥接命令。 */
    setIsEditorReady(true);
  }

  async function saveNow(): Promise<void> {
    /** 中文注释：在离开页面或显式完成时立即提交当前正文，避免 debounce 造成最后一次输入丢失。 */
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const latestSnapshot = editorRef.current?.getSnapshot() ?? snapshot;
    await submitLatestSnapshot(latestSnapshot);
  }

  return {
    editorRef,
    editorKey,
    initialBodyMarkdown: snapshot.body_markdown,
    mediaAssets: visibleMediaAssets,
    formattingState,
    isDraftHydrated,
    statusLabel: syncStatus === 'syncing' ? '同步中' : syncStatus === 'synced' ? '已同步' : null,
    isUploadingImage,
    isAiRunning,
    saveNow,
    onEditorReady: handleEditorReady,
    onSnapshotChange: handleSnapshotChange,
    onSelectionChange: handleSelectionChange,
    onFormattingStateChange: handleFormattingStateChange,
    onInsertImage: pickAndInsertImage,
    onAiAction: runAiAction,
  };
}
