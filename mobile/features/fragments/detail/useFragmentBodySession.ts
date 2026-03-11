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
import { peekFragmentCache } from '@/features/fragments/fragmentRepository';
import {
  resolveDoneAction,
  resolveSaveOutcome,
  type FragmentSyncStatus,
} from '@/features/fragments/fragmentSaveState';
import type {
  Fragment,
  FragmentAiPatch,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';
import type { FragmentRichEditorHandle } from '@/features/fragments/components/FragmentRichEditor';

const AUTOSAVE_DELAY_MS = 800;

interface UseFragmentBodySessionOptions {
  fragmentId?: string | null;
  fragment: Fragment | null;
  commitRemoteFragment: (fragment: Fragment) => Promise<void>;
  commitOptimisticFragment: (fragment: Fragment) => Promise<void>;
}

interface DraftState {
  fragmentId: string | null;
  markdown: string | null;
  loaded: boolean;
}

function resolveInitialMarkdown(fragment: Fragment | null): string {
  /** 中文注释：正文编辑器只接受规整后的 Markdown，避免初始化时多次抖动。 */
  return normalizeBodyMarkdown(fragment?.body_markdown);
}

function buildSnapshot(markdown: string): FragmentEditorSnapshot {
  /** 中文注释：统一生成编辑器快照，供自动保存、分享和 AI patch 复用。 */
  const normalized = normalizeBodyMarkdown(markdown);
  return {
    body_markdown: normalized,
    plain_text: extractPlainTextFromMarkdown(normalized),
    asset_ids: extractAssetIdsFromMarkdown(normalized),
  };
}

function buildOptimisticFragmentSnapshot(
  fragment: Fragment,
  nextSnapshot: FragmentEditorSnapshot,
  mediaAssets: MediaAsset[]
): Fragment {
  /** 中文注释：把当前编辑结果合成为展示态 fragment，用于详情页和列表即时回显。 */
  return {
    ...fragment,
    body_markdown: nextSnapshot.body_markdown,
    plain_text_snapshot: nextSnapshot.plain_text,
    media_assets: mediaAssets,
  };
}

function collectAssetIds(mediaAssets: MediaAsset[]): string[] {
  /** 中文注释：统一比较素材列表，只按资源 id 判断是否已经同步到展示态。 */
  return mediaAssets.map((asset) => asset.id);
}

function areAssetIdsEqual(left: string[], right: string[]): boolean {
  /** 中文注释：保持素材顺序敏感比较，避免图片插入顺序变化被忽略。 */
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function useFragmentBodySession({
  fragmentId,
  fragment,
  commitRemoteFragment,
  commitOptimisticFragment,
}: UseFragmentBodySessionOptions) {
  /** 中文注释：管理正文编辑会话，把自动保存、草稿、AI patch 和插图收口在编辑层。 */
  const [snapshot, setSnapshot] = useState<FragmentEditorSnapshot>(buildSnapshot(''));
  const [syncStatus, setSyncStatus] = useState<FragmentSyncStatus>('idle');
  const [selectionText, setSelectionText] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [formattingState, setFormattingState] = useState<FragmentEditorFormattingState | null>(null);
  const [editorKey, setEditorKey] = useState('empty');
  const [runtimeMediaAssets, setRuntimeMediaAssets] = useState<MediaAsset[]>([]);
  const [draftState, setDraftState] = useState<DraftState>({
    fragmentId: null,
    markdown: null,
    loaded: false,
  });
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedSnapshotRef = useRef<FragmentEditorSnapshot | null>(null);
  const lastSyncedMarkdownRef = useRef('');
  const editorRef = useRef<FragmentRichEditorHandle | null>(null);
  const hydratedFragmentIdRef = useRef<string | null>(null);

  const resolvedFragmentId = fragmentId ?? fragment?.id ?? null;
  const initialMarkdown = resolveInitialMarkdown(fragment);
  const visibleMediaAssets = useMemo(() => {
    const merged = [...(fragment?.media_assets ?? [])];
    for (const asset of runtimeMediaAssets) {
      if (!merged.some((item) => item.id === asset.id)) merged.push(asset);
    }
    return merged;
  }, [fragment?.media_assets, runtimeMediaAssets]);

  useEffect(() => {
    /** 中文注释：服务端返回新签名地址后覆盖运行态素材，避免抽屉继续展示旧 URL。 */
    if (!fragment?.media_assets) return;
    setRuntimeMediaAssets(fragment.media_assets);
  }, [fragment?.media_assets]);

  useEffect(() => {
    /** 中文注释：按 fragment 维度预取本地草稿，避免编辑器初始化前阻塞首屏。 */
    if (!resolvedFragmentId) {
      setDraftState({
        fragmentId: null,
        markdown: null,
        loaded: false,
      });
      return;
    }
    let cancelled = false;
    setDraftState({
      fragmentId: resolvedFragmentId,
      markdown: null,
      loaded: false,
    });
    void (async () => {
      const draft = await loadFragmentBodyDraft(resolvedFragmentId);
      if (cancelled) return;
      setDraftState({
        fragmentId: resolvedFragmentId,
        markdown: draft,
        loaded: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedFragmentId]);

  useEffect(() => {
    /** 中文注释：仅在 fragment 或草稿真正切换时重建编辑会话，避免 DOM 编辑器重复初始化。 */
    if (!resolvedFragmentId) {
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
    if (!fragment || fragment.id !== resolvedFragmentId) return;
    if (!draftState.loaded || draftState.fragmentId !== resolvedFragmentId) return;
    if (hydratedFragmentIdRef.current === resolvedFragmentId) return;
    hydratedFragmentIdRef.current = resolvedFragmentId;
    setSelectionText('');
    setIsEditorReady(false);
    setIsDraftHydrated(false);
    setRuntimeMediaAssets(fragment.media_assets ?? []);
    const nextMarkdown = normalizeBodyMarkdown(draftState.markdown ?? initialMarkdown);
    const nextSnapshot = buildSnapshot(nextMarkdown);
    const remoteBaseline =
      normalizeBodyMarkdown(peekFragmentCache(resolvedFragmentId)?.fragment.body_markdown) ||
      (draftState.markdown == null ? normalizeBodyMarkdown(fragment.body_markdown) : '');
    hydratedRef.current = true;
    lastSyncedMarkdownRef.current = remoteBaseline;
    setSnapshot(nextSnapshot);
    setSyncStatus(nextSnapshot.body_markdown === lastSyncedMarkdownRef.current ? 'synced' : 'idle');
    setIsDraftHydrated(true);
    setFormattingState(null);
    setEditorKey(`${resolvedFragmentId}:${Date.now()}`);
  }, [draftState.fragmentId, draftState.loaded, draftState.markdown, fragment, initialMarkdown, resolvedFragmentId]);

  useEffect(() => {
    /** 中文注释：正文变更后先固化本地草稿，再把可见 fragment 更新为最新编辑结果。 */
    if (!resolvedFragmentId || !hydratedRef.current || !fragment) return;
    if (snapshot.body_markdown === lastSyncedMarkdownRef.current) return;
    const optimisticFragment = buildOptimisticFragmentSnapshot(fragment, snapshot, visibleMediaAssets);
    const currentMarkdown = normalizeBodyMarkdown(fragment.body_markdown);
    const currentAssetIds = collectAssetIds(fragment.media_assets ?? []);
    const nextAssetIds = collectAssetIds(visibleMediaAssets);
    if (currentMarkdown === optimisticFragment.body_markdown && areAssetIdsEqual(currentAssetIds, nextAssetIds)) {
      return;
    }
    void Promise.all([
      saveFragmentBodyDraft(resolvedFragmentId, snapshot.body_markdown),
      commitOptimisticFragment(optimisticFragment),
    ]).catch(() => undefined);
  }, [commitOptimisticFragment, fragment, resolvedFragmentId, snapshot, visibleMediaAssets]);

  useEffect(() => {
    /** 中文注释：输入停顿后自动提交最后一次快照，保持保存请求串行且可恢复。 */
    if (!resolvedFragmentId || !fragment || !hydratedRef.current) return;
    if (snapshot.body_markdown === lastSyncedMarkdownRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const latestSnapshot = editorRef.current?.getSnapshot() ?? snapshot;
      void submitLatestSnapshot(latestSnapshot).catch(() => undefined);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [fragment, resolvedFragmentId, snapshot]);

  async function submitLatestSnapshot(nextSnapshot: FragmentEditorSnapshot): Promise<void> {
    /** 中文注释：正文保存请求只允许一条在途，请求堆积时只保留最后一版快照。 */
    if (!resolvedFragmentId || !fragment) return;
    const normalizedMarkdown = normalizeBodyMarkdown(nextSnapshot.body_markdown);
    if (normalizedMarkdown === lastSyncedMarkdownRef.current) return;
    if (inFlightRef.current) {
      queuedSnapshotRef.current = nextSnapshot;
      return await inFlightRef.current;
    }
    queuedSnapshotRef.current = null;
    const savePromise = (async () => {
      let saveError: unknown = null;
      setSyncStatus('syncing');
      try {
        const updated = await updateFragment(resolvedFragmentId, {
          body_markdown: normalizedMarkdown,
          media_asset_ids: nextSnapshot.asset_ids,
        });
        const outcome = resolveSaveOutcome({
          ok: true,
          savedMarkdown: normalizeBodyMarkdown(updated.body_markdown),
          attemptedMarkdown: normalizedMarkdown,
        });
        lastSyncedMarkdownRef.current = outcome.lastSyncedMarkdown;
        if (outcome.shouldClearDraft) {
          await clearFragmentBodyDraft(resolvedFragmentId);
        }
        await commitRemoteFragment(updated);
        setRuntimeMediaAssets(updated.media_assets ?? []);
        setSyncStatus(outcome.syncStatus);
      } catch (error) {
        saveError = error;
        const outcome = resolveSaveOutcome({
          ok: false,
          savedMarkdown: lastSyncedMarkdownRef.current,
          attemptedMarkdown: normalizedMarkdown,
        });
        setSyncStatus(outcome.syncStatus);
        throw error;
      } finally {
        inFlightRef.current = null;
        if (!saveError) {
          const queuedSnapshot = queuedSnapshotRef.current;
          queuedSnapshotRef.current = null;
          if (
            queuedSnapshot &&
            normalizeBodyMarkdown(queuedSnapshot.body_markdown) !== lastSyncedMarkdownRef.current
          ) {
            await submitLatestSnapshot(queuedSnapshot);
          }
        }
      }
    })();

    inFlightRef.current = savePromise;
    await savePromise;
  }

  function handleSnapshotChange(nextSnapshot: FragmentEditorSnapshot): void {
    /** 中文注释：同步记录 DOM 编辑器节流后的快照，让工具栏和保存链路复用同一数据。 */
    setSnapshot({
      body_markdown: normalizeBodyMarkdown(nextSnapshot.body_markdown),
      plain_text: nextSnapshot.plain_text,
      asset_ids: nextSnapshot.asset_ids,
    });
    if (syncStatus === 'synced') setSyncStatus('idle');
  }

  function handleSelectionChange(text: string): void {
    /** 中文注释：记录当前选中文本，供 AI patch 优先围绕局部内容生成。 */
    setSelectionText(text.trim());
  }

  function handleFormattingStateChange(nextState: FragmentEditorFormattingState): void {
    /** 中文注释：同步工具栏展示态，避免页面层直接感知 DOM 编辑器实例。 */
    setFormattingState(nextState);
  }

  async function pickAndInsertImage(): Promise<void> {
    /** 中文注释：通过系统文件选择器插图并把素材插入当前正文。 */
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
    /** 中文注释：请求后端生成 Markdown patch，并优先在 DOM 编辑器内原位应用。 */
    if (!resolvedFragmentId) return;
    try {
      setIsAiRunning(true);
      const latestSnapshot = editorRef.current?.getSnapshot() ?? snapshot;
      const response = await requestAiEdit(resolvedFragmentId, {
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
    /** 中文注释：桥接可用时直接改 DOM，不可用时回退到本地 Markdown 补丁。 */
    if (isEditorReady) {
      editorRef.current?.applyPatch(patch);
      return;
    }
    const nextMarkdown = applyAiPatchToMarkdown(snapshot.body_markdown, patch, selectionText);
    handleSnapshotChange(buildSnapshot(nextMarkdown));
  }

  function handleEditorReady(): void {
    /** 中文注释：记录 DOM 编辑器已就绪，后续优先使用 bridge 命令。 */
    setIsEditorReady(true);
  }

  async function saveNow(): Promise<void> {
    /** 中文注释：离开页面前主动 flush 当前快照，降低最后一次输入丢失风险。 */
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (inFlightRef.current) {
      await inFlightRef.current.catch(() => undefined);
    }
    const latestSnapshot = editorRef.current?.getSnapshot() ?? snapshot;
    try {
      await submitLatestSnapshot(latestSnapshot);
      const doneAction = resolveDoneAction(null);
      if (!doneAction.ok) {
        throw new Error(doneAction.message ?? '内容未同步');
      }
    } catch (error) {
      const doneAction = resolveDoneAction(error);
      throw new Error(doneAction.message ?? '内容未同步');
    }
  }

  return {
    editorRef,
    editorKey,
    initialBodyMarkdown: snapshot.body_markdown,
    mediaAssets: visibleMediaAssets,
    formattingState,
    isDraftHydrated,
    statusLabel:
      syncStatus === 'syncing'
        ? '同步中'
        : syncStatus === 'synced'
          ? '已同步'
          : syncStatus === 'unsynced'
            ? '未同步'
            : null,
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
