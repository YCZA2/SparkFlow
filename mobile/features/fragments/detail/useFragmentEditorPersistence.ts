import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { updateFragment } from '@/features/fragments/api';
import {
  clearFragmentBodyDraft,
  loadFragmentBodyDraft,
  saveFragmentBodyDraft,
} from '@/features/fragments/bodyDrafts';
import { normalizeBodyMarkdown } from '@/features/fragments/bodyMarkdown';
import { peekFragmentCache } from '@/features/fragments/fragmentRepository';
import {
  resolveDoneAction,
  resolveSaveOutcome,
  type FragmentSyncStatus,
} from '@/features/fragments/fragmentSaveState';
import type {
  Fragment,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';
import type { FragmentRichEditorHandle } from '@/features/fragments/components/FragmentRichEditor';

import {
  buildFragmentEditorSnapshot,
  buildOptimisticFragmentSnapshot,
  mergeVisibleMediaAssets,
  resolveHydratedBodySession,
  shouldCommitOptimisticFragment,
  shouldProtectSuspiciousEmptySnapshot,
  shouldRehydrateBodySession,
} from './bodySessionState';
import { createLatestOnlySaveController } from './fragmentSaveController';

const AUTOSAVE_DELAY_MS = 800;

interface UseFragmentEditorPersistenceOptions {
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

export function useFragmentEditorPersistence({
  fragmentId,
  fragment,
  commitRemoteFragment,
  commitOptimisticFragment,
}: UseFragmentEditorPersistenceOptions) {
  /** 中文注释：处理正文初始化、草稿恢复、自动保存和可见素材合成。 */
  const [snapshot, setSnapshot] = useState<FragmentEditorSnapshot>(
    buildFragmentEditorSnapshot('')
  );
  const [syncStatus, setSyncStatus] = useState<FragmentSyncStatus>('idle');
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [editorKey, setEditorKey] = useState('empty');
  const [runtimeMediaAssets, setRuntimeMediaAssets] = useState<MediaAsset[]>([]);
  const [draftState, setDraftState] = useState<DraftState>({
    fragmentId: null,
    markdown: null,
    loaded: false,
  });
  const hydratedRef = useRef(false);
  const hydratedFragmentIdRef = useRef<string | null>(null);
  const lastSyncedMarkdownRef = useRef('');
  const localDraftMarkdownRef = useRef<string | null>(null);
  const hydratedSnapshotMarkdownRef = useRef('');
  const awaitingInitialSnapshotRef = useRef(false);
  const hasConfirmedLocalEditRef = useRef(false);
  const hydrationRevisionRef = useRef('');
  const retriedHydrationRevisionRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<FragmentRichEditorHandle | null>(null);
  const fragmentRef = useRef<Fragment | null>(fragment);
  const resolvedFragmentIdRef = useRef<string | null>(fragmentId ?? fragment?.id ?? null);
  const commitRemoteFragmentRef = useRef(commitRemoteFragment);

  const resolvedFragmentId = fragmentId ?? fragment?.id ?? null;
  const visibleMediaAssets = useMemo(
    () => mergeVisibleMediaAssets(fragment?.media_assets, runtimeMediaAssets),
    [fragment?.media_assets, runtimeMediaAssets]
  );

  const resolveHydrationRevision = useCallback((targetFragment: Fragment): string => {
    /** 中文注释：用正文、素材和草稿组合出当前会话版本号，避免同一异常快照反复重建。 */
    const mediaAssetIds = (targetFragment.media_assets ?? []).map((asset) => asset.id).join(',');
    return [
      targetFragment.id,
      normalizeBodyMarkdown(targetFragment.body_markdown),
      mediaAssetIds,
      normalizeBodyMarkdown(localDraftMarkdownRef.current),
    ].join('::');
  }, []);

  const saveControllerRef = useRef(
    createLatestOnlySaveController<FragmentEditorSnapshot>({
      shouldProcess: (nextSnapshot) =>
        normalizeBodyMarkdown(nextSnapshot.body_markdown) !==
        lastSyncedMarkdownRef.current,
      submit: async (nextSnapshot) => {
        /** 中文注释：把正文保存请求串行化，并在成功后刷新可见 fragment。 */
        const currentFragmentId = resolvedFragmentIdRef.current;
        if (!currentFragmentId || !fragmentRef.current) return;
        if (shouldProtectSuspiciousEmptySnapshot({
          snapshot: nextSnapshot,
          remoteBaseline: lastSyncedMarkdownRef.current,
          hasLocalDraft: localDraftMarkdownRef.current !== null,
          hasConfirmedLocalEdit: hasConfirmedLocalEditRef.current,
        })) {
          return;
        }
        const normalizedMarkdown = normalizeBodyMarkdown(nextSnapshot.body_markdown);
        setSyncStatus('syncing');
        try {
          const updated = await updateFragment(currentFragmentId, {
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
            await clearFragmentBodyDraft(currentFragmentId);
            localDraftMarkdownRef.current = null;
          } else {
            localDraftMarkdownRef.current = normalizedMarkdown;
          }
          hydratedSnapshotMarkdownRef.current = outcome.lastSyncedMarkdown;
          hasConfirmedLocalEditRef.current = false;
          await commitRemoteFragmentRef.current(updated);
          setRuntimeMediaAssets(updated.media_assets ?? []);
          setSyncStatus(outcome.syncStatus);
        } catch (error) {
          const outcome = resolveSaveOutcome({
            ok: false,
            savedMarkdown: lastSyncedMarkdownRef.current,
            attemptedMarkdown: normalizedMarkdown,
          });
          localDraftMarkdownRef.current = normalizedMarkdown;
          setSyncStatus(outcome.syncStatus);
          throw error;
        }
      },
    })
  );

  useEffect(() => {
    /** 中文注释：保存控制器读取 ref，避免闭包拿到过期 fragment 上下文。 */
    fragmentRef.current = fragment;
    resolvedFragmentIdRef.current = resolvedFragmentId;
    commitRemoteFragmentRef.current = commitRemoteFragment;
  }, [commitRemoteFragment, fragment, resolvedFragmentId]);

  useEffect(() => {
    /** 中文注释：用 ref 维护当前草稿真值，供保存保护和二段 hydrate 读取最新状态。 */
    localDraftMarkdownRef.current = draftState.loaded ? draftState.markdown : null;
  }, [draftState.loaded, draftState.markdown]);

  useEffect(() => {
    /** 中文注释：服务端刷新后用最新签名素材覆盖运行态副本。 */
    if (!fragment?.media_assets) return;
    setRuntimeMediaAssets(fragment.media_assets);
  }, [fragment?.media_assets]);

  useEffect(() => {
    /** 中文注释：按 fragment 维度预取本地草稿，让编辑器首屏优先恢复用户输入。 */
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
    /** 中文注释：只有当详情资源和草稿都稳定后，才真正重建编辑会话。 */
    if (!resolvedFragmentId) {
      hydratedRef.current = false;
      hydratedFragmentIdRef.current = null;
      lastSyncedMarkdownRef.current = '';
      localDraftMarkdownRef.current = null;
      hydratedSnapshotMarkdownRef.current = '';
      awaitingInitialSnapshotRef.current = false;
      hasConfirmedLocalEditRef.current = false;
      hydrationRevisionRef.current = '';
      retriedHydrationRevisionRef.current = null;
      setSnapshot(buildFragmentEditorSnapshot(''));
      setSyncStatus('idle');
      setIsEditorReady(false);
      setIsDraftHydrated(false);
      setRuntimeMediaAssets([]);
      setEditorKey('empty');
      return;
    }
    if (!fragment || fragment.id !== resolvedFragmentId) return;
    if (!draftState.loaded || draftState.fragmentId !== resolvedFragmentId) return;
    const nextHydrationRevision = resolveHydrationRevision(fragment);
    const shouldInitialize = hydratedFragmentIdRef.current !== resolvedFragmentId;
    const shouldRefresh = !shouldInitialize && shouldRehydrateBodySession({
      fragment,
      draftMarkdown: localDraftMarkdownRef.current,
      currentSnapshot: snapshot,
      remoteBaseline: lastSyncedMarkdownRef.current,
      visibleMediaAssets,
      hasConfirmedLocalEdit: hasConfirmedLocalEditRef.current,
    });
    const alreadyRetriedCurrentRevision =
      retriedHydrationRevisionRef.current === nextHydrationRevision;
    if (shouldRefresh && hydrationRevisionRef.current === nextHydrationRevision && alreadyRetriedCurrentRevision) {
      return;
    }
    if (!shouldInitialize && !shouldRefresh) return;

    hydratedFragmentIdRef.current = resolvedFragmentId;
    setIsEditorReady(false);
    setIsDraftHydrated(false);
    setRuntimeMediaAssets(fragment.media_assets ?? []);
    const hydrated = resolveHydratedBodySession({
      fragment,
      draftMarkdown: draftState.markdown,
      cachedBodyMarkdown:
        peekFragmentCache(resolvedFragmentId)?.fragment.body_markdown ?? null,
    });
    hydratedRef.current = true;
    if (hydrationRevisionRef.current !== nextHydrationRevision) {
      retriedHydrationRevisionRef.current = null;
    } else if (shouldRefresh) {
      retriedHydrationRevisionRef.current = nextHydrationRevision;
    }
    hydrationRevisionRef.current = nextHydrationRevision;
    lastSyncedMarkdownRef.current = hydrated.remoteBaseline;
    hydratedSnapshotMarkdownRef.current = hydrated.snapshot.body_markdown;
    awaitingInitialSnapshotRef.current = true;
    hasConfirmedLocalEditRef.current = localDraftMarkdownRef.current !== null;
    setSnapshot(hydrated.snapshot);
    setSyncStatus(hydrated.syncStatus);
    setIsDraftHydrated(true);
    setEditorKey(`${resolvedFragmentId}:${Date.now()}`);
  }, [
    draftState.fragmentId,
    draftState.loaded,
    draftState.markdown,
    fragment,
    resolvedFragmentId,
    resolveHydrationRevision,
    snapshot,
    visibleMediaAssets,
  ]);

  useEffect(() => {
    /** 中文注释：正文变更时先固化本地草稿，再同步详情展示态。 */
    if (!resolvedFragmentId || !hydratedRef.current || !fragment) return;
    if (snapshot.body_markdown === lastSyncedMarkdownRef.current) return;
    if (shouldProtectSuspiciousEmptySnapshot({
      snapshot,
      remoteBaseline: lastSyncedMarkdownRef.current,
      hasLocalDraft: localDraftMarkdownRef.current !== null,
      hasConfirmedLocalEdit: hasConfirmedLocalEditRef.current,
    })) {
      return;
    }
    if (!shouldCommitOptimisticFragment(fragment, snapshot, visibleMediaAssets)) {
      return;
    }
    localDraftMarkdownRef.current = snapshot.body_markdown;
    void Promise.all([
      saveFragmentBodyDraft(resolvedFragmentId, snapshot.body_markdown),
      commitOptimisticFragment(
        buildOptimisticFragmentSnapshot(fragment, snapshot, visibleMediaAssets)
      ),
    ]).catch(() => undefined);
  }, [
    commitOptimisticFragment,
    fragment,
    resolvedFragmentId,
    snapshot,
    visibleMediaAssets,
  ]);

  useEffect(() => {
    /** 中文注释：输入停顿后提交最后一次快照，避免编辑时反复打满请求。 */
    if (!resolvedFragmentId || !fragment || !hydratedRef.current) return;
    if (snapshot.body_markdown === lastSyncedMarkdownRef.current) return;
    if (shouldProtectSuspiciousEmptySnapshot({
      snapshot,
      remoteBaseline: lastSyncedMarkdownRef.current,
      hasLocalDraft: localDraftMarkdownRef.current !== null,
      hasConfirmedLocalEdit: hasConfirmedLocalEditRef.current,
    })) {
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const getSnapshot = editorRef.current?.getSnapshot;
      const latestSnapshot =
        typeof getSnapshot === 'function' ? getSnapshot() ?? snapshot : snapshot;
      void saveControllerRef.current.submitLatest(latestSnapshot).catch(() => undefined);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [fragment, resolvedFragmentId, snapshot]);

  const onSnapshotChange = useCallback((nextSnapshot: FragmentEditorSnapshot) => {
    /** 中文注释：DOM 编辑器只把节流后的快照回传给持久化层。 */
    const builtSnapshot = buildFragmentEditorSnapshot(nextSnapshot.body_markdown);
    if (awaitingInitialSnapshotRef.current) {
      awaitingInitialSnapshotRef.current = false;
    } else if (builtSnapshot.body_markdown !== hydratedSnapshotMarkdownRef.current) {
      hasConfirmedLocalEditRef.current = true;
    }
    setSnapshot(builtSnapshot);
    setSyncStatus((current) => (current === 'synced' ? 'idle' : current));
  }, []);

  const onEditorReady = useCallback(() => {
    /** 中文注释：记录 bridge 已可用，后续优先走原位 patch 和命令。 */
    setIsEditorReady(true);
  }, []);

  const getLiveSnapshot = useCallback(
    () => {
      const getSnapshot = editorRef.current?.getSnapshot;
      return typeof getSnapshot === 'function' ? getSnapshot() ?? snapshot : snapshot;
    },
    [snapshot]
  );

  const saveNow = useCallback(async () => {
    /** 中文注释：离页前主动 flush 当前正文，保证最后一版输入尽量落远端。 */
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const getSnapshot = editorRef.current?.getSnapshot;
    const latestSnapshot =
      typeof getSnapshot === 'function' ? getSnapshot() ?? snapshot : snapshot;
    try {
      if (shouldProtectSuspiciousEmptySnapshot({
        snapshot: latestSnapshot,
        remoteBaseline: lastSyncedMarkdownRef.current,
        hasLocalDraft: localDraftMarkdownRef.current !== null,
        hasConfirmedLocalEdit: hasConfirmedLocalEditRef.current,
      })) {
        return;
      }
      await saveControllerRef.current.submitLatest(latestSnapshot);
      const doneAction = resolveDoneAction(null);
      if (!doneAction.ok) {
        throw new Error(doneAction.message ?? '内容未同步');
      }
    } catch (error) {
      const doneAction = resolveDoneAction(error);
      throw new Error(doneAction.message ?? '内容未同步');
    }
  }, [snapshot]);

  return {
    editorRef,
    editorKey,
    snapshot,
    syncStatus,
    isEditorReady,
    isDraftHydrated,
    mediaAssets: visibleMediaAssets,
    statusLabel:
      syncStatus === 'syncing'
        ? '同步中'
        : syncStatus === 'synced'
          ? '已同步'
          : syncStatus === 'unsynced'
            ? '未同步'
            : null,
    getLiveSnapshot,
    onEditorReady,
    onSnapshotChange,
    saveNow,
    setRuntimeMediaAssets,
  };
}
