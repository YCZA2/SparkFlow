import {
  createImageHtml,
  normalizeBodyHtml,
} from '@/features/fragments/bodyMarkdown';
import {
  appendRuntimeMediaAsset,
  applyAiPatchFallbackToSnapshot,
  buildFragmentEditorSnapshot,
  mergeVisibleMediaAssets,
  resolveHydratedBodySession,
  shouldCommitOptimisticFragment,
  shouldProtectSuspiciousEmptySnapshot,
  shouldRehydrateBodySession,
} from '@/features/fragments/detail/bodySessionState';
import type { FragmentSyncStatus } from '@/features/fragments/fragmentSaveState';
import type {
  EditorSessionPhase,
  EditorSessionSnapshot,
  Fragment,
  FragmentAiPatch,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
  MediaAsset,
  SessionBaseline,
} from '@/types/fragment';

interface SessionSourceState {
  fragment: Fragment | null;
  draft_html: string | null;
  draft_loaded: boolean;
  cached_body_html: string | null;
}

export interface EditorSessionState {
  fragmentId: string | null;
  editorKey: string;
  phase: EditorSessionPhase;
  baseline: SessionBaseline | null;
  snapshot: EditorSessionSnapshot;
  mediaAssets: MediaAsset[];
  syncStatus: FragmentSyncStatus;
  isEditorReady: boolean;
  isDraftHydrated: boolean;
  hasConfirmedLocalEdit: boolean;
  selectionText: string;
  formattingState: FragmentEditorFormattingState | null;
  errorMessage: string | null;
  saveRequestId: number;
  source: SessionSourceState;
}

export type EditorSessionEvent =
  | { type: 'RESET_SESSION'; fragmentId: string | null }
  | { type: 'LOCAL_DRAFT_LOADED'; html: string | null }
  | { type: 'CACHE_LOADED'; html: string | null }
  | { type: 'REMOTE_LOADED'; fragment: Fragment | null }
  | { type: 'EDITOR_READY' }
  | { type: 'SNAPSHOT_CHANGED'; snapshot: FragmentEditorSnapshot }
  | { type: 'SELECTION_CHANGED'; text: string }
  | { type: 'FORMATTING_CHANGED'; formattingState: FragmentEditorFormattingState }
  | { type: 'IMAGE_UPLOADED'; asset: MediaAsset }
  | { type: 'AI_PATCH_APPLIED'; patch: FragmentAiPatch }
  | { type: 'SAVE_REQUESTED' }
  | { type: 'SAVE_STARTED' }
  | { type: 'LOCAL_SAVE_SUCCEEDED'; fragment: Fragment | null; savedHtml: string }
  | { type: 'SAVE_SUCCEEDED'; fragment: Fragment | null; savedHtml: string }
  | { type: 'SAVE_FAILED'; attemptedHtml: string; message: string | null };

function resolveLocalDraftSyncStatus(fragment: Fragment | null): FragmentSyncStatus {
  /*把本地草稿同步态映射为统一的编辑器保存状态。 */
  if (!fragment?.is_local_draft) return 'idle';
  if (fragment.local_sync_status === 'synced') return 'synced';
  if (fragment.local_sync_status === 'syncing' || fragment.local_sync_status === 'creating') {
    return 'syncing';
  }
  if (fragment.local_sync_status === 'failed_pending_retry') return 'unsynced';
  return 'idle';
}

function resolveSessionPhase(state: EditorSessionState): EditorSessionPhase {
  /*根据 hydrate 和 bridge 就绪度推导当前会话阶段。 */
  if (state.errorMessage) return 'error';
  if (!state.fragmentId) return 'booting';
  if (!state.isDraftHydrated || !state.isEditorReady) return 'hydrating';
  return 'ready';
}

export function createInitialEditorSessionState(fragmentId: string | null): EditorSessionState {
  /*为指定 fragment 构造全新的编辑会话状态。 */
  return {
    fragmentId,
    editorKey: fragmentId ?? 'empty',
    phase: fragmentId ? 'booting' : 'hydrating',
    baseline: null,
    snapshot: buildFragmentEditorSnapshot(''),
    mediaAssets: [],
    syncStatus: 'idle',
    isEditorReady: false,
    isDraftHydrated: false,
    hasConfirmedLocalEdit: false,
    selectionText: '',
      formattingState: null,
      errorMessage: null,
      saveRequestId: 0,
      source: {
        fragment: null,
        draft_html: null,
        draft_loaded: false,
        cached_body_html: null,
      },
  };
}

export function resolveSessionBaseline(options: {
  fragment: Fragment;
  draftHtml: string | null;
  cachedBodyHtml: string | null;
}): SessionBaseline {
  /*把草稿、缓存和远端详情解析为唯一初始化基线。 */
  const hydrated = resolveHydratedBodySession({
    fragment: options.fragment,
    draftHtml: options.draftHtml,
    cachedBodyHtml: options.cachedBodyHtml,
  });
  return {
    fragment_id: options.fragment.id,
    snapshot: hydrated.snapshot,
    remote_baseline: hydrated.remoteBaseline,
    cached_body_html: options.cachedBodyHtml,
    draft_html: options.draftHtml,
    media_assets: options.fragment.media_assets ?? [],
    is_local_first: Boolean(options.fragment.is_local_draft),
    sync_status: options.fragment.is_local_draft
      ? resolveLocalDraftSyncStatus(options.fragment)
      : hydrated.syncStatus,
  };
}

function reconcileHydration(state: EditorSessionState): EditorSessionState {
  /*在输入源变化后决定是初始化、刷新还是仅同步素材基线。 */
  const fragment = state.source.fragment;
  if (!state.fragmentId) {
    return {
      ...state,
      phase: resolveSessionPhase(state),
    };
  }
  if (!fragment || !state.source.draft_loaded) {
    return {
      ...state,
      phase: state.isEditorReady ? 'hydrating' : 'booting',
    };
  }

  const baseline = resolveSessionBaseline({
    fragment,
    draftHtml: state.source.draft_html,
    cachedBodyHtml: state.source.cached_body_html,
  });
  const currentBaseline = state.baseline;
  const shouldInitialize = !currentBaseline || currentBaseline.fragment_id !== fragment.id;
  const shouldRefresh = !shouldInitialize && currentBaseline
      ? shouldRehydrateBodySession({
        fragment,
        draftHtml: state.source.draft_html,
        currentSnapshot: state.snapshot,
        remoteBaseline: currentBaseline.remote_baseline,
        visibleMediaAssets: state.mediaAssets,
        hasConfirmedLocalEdit: state.hasConfirmedLocalEdit,
      })
    : false;
  const mergedMediaAssets = mergeVisibleMediaAssets(fragment.media_assets, state.mediaAssets);

  if (shouldInitialize || shouldRefresh) {
    return {
      ...state,
      baseline,
      snapshot: baseline.snapshot,
      mediaAssets: mergeVisibleMediaAssets(fragment.media_assets, []),
      syncStatus: baseline.sync_status as FragmentSyncStatus,
      isDraftHydrated: true,
      hasConfirmedLocalEdit: Boolean(baseline.draft_html),
      errorMessage: null,
      phase: state.isEditorReady ? 'ready' : 'hydrating',
    };
  }

  const nextSyncStatus = fragment.is_local_draft
    ? resolveLocalDraftSyncStatus(fragment)
    : state.source.draft_html === null &&
        normalizeBodyHtml(fragment.body_html) === normalizeBodyHtml(state.snapshot.body_html)
      ? 'synced'
      : state.syncStatus;

  return {
    ...state,
    baseline: {
      ...currentBaseline,
      cached_body_html: baseline.cached_body_html,
      media_assets: fragment.media_assets ?? [],
      sync_status: nextSyncStatus,
    },
    mediaAssets: mergedMediaAssets,
    syncStatus: nextSyncStatus,
    isDraftHydrated: true,
    phase: resolveSessionPhase({
      ...state,
      isDraftHydrated: true,
      errorMessage: null,
    }),
  };
}

export function shouldQueueAutosave(state: EditorSessionState): boolean {
  /*只有会话稳定且快照真正偏离远端基线时才进入自动保存队列。 */
  if (!state.fragmentId || !state.isDraftHydrated || !state.source.fragment) return false;
  const remoteBaseline = state.baseline?.remote_baseline ?? '';
  if (state.snapshot.body_html === normalizeBodyHtml(remoteBaseline)) return false;
  return !shouldProtectSuspiciousEmptySnapshot({
    snapshot: state.snapshot,
    remoteBaseline,
    hasLocalDraft: state.source.draft_html !== null,
    hasConfirmedLocalEdit: state.hasConfirmedLocalEdit,
  });
}

export function shouldPublishOptimisticFragment(state: EditorSessionState): boolean {
  /*仅当正文或素材展示态变化时才回写详情资源层。 */
  if (!state.source.fragment || !state.fragmentId || !state.isDraftHydrated) return false;
  const remoteBaseline = state.baseline?.remote_baseline ?? '';
  if (shouldProtectSuspiciousEmptySnapshot({
    snapshot: state.snapshot,
    remoteBaseline,
    hasLocalDraft: state.source.draft_html !== null,
    hasConfirmedLocalEdit: state.hasConfirmedLocalEdit,
  })) {
    return false;
  }
  return shouldCommitOptimisticFragment(state.source.fragment, state.snapshot, state.mediaAssets);
}

export function appendImageToSnapshot(
  snapshot: FragmentEditorSnapshot,
  asset: MediaAsset
): FragmentEditorSnapshot {
  /*bridge 不可用时回退为在 HTML 末尾追加一张图片。 */
  const imageHtml = `<p>${createImageHtml(asset.id, String(asset.original_filename ?? ''))}</p>`;
  const nextHtml = snapshot.body_html
    ? `${snapshot.body_html}${imageHtml}`
    : imageHtml;
  return buildFragmentEditorSnapshot(nextHtml);
}

export function reduceEditorSession(
  state: EditorSessionState,
  event: EditorSessionEvent
): EditorSessionState {
  /*用单向事件流收敛正文会话状态，避免副作用互相覆盖。 */
  if (event.type === 'RESET_SESSION') {
    return createInitialEditorSessionState(event.fragmentId);
  }

  if (event.type === 'LOCAL_DRAFT_LOADED') {
    return reconcileHydration({
      ...state,
      source: {
        ...state.source,
        draft_loaded: true,
        draft_html: event.html,
      },
    });
  }

  if (event.type === 'CACHE_LOADED') {
    return reconcileHydration({
      ...state,
      source: {
        ...state.source,
        cached_body_html: event.html,
      },
    });
  }

  if (event.type === 'REMOTE_LOADED') {
    return reconcileHydration({
      ...state,
      source: {
        ...state.source,
        fragment: event.fragment,
      },
    });
  }

  if (event.type === 'EDITOR_READY') {
    return {
      ...state,
      isEditorReady: true,
      phase: resolveSessionPhase({
        ...state,
        isEditorReady: true,
      }),
    };
  }

  if (event.type === 'SNAPSHOT_CHANGED') {
    const hasMeaningfulChange =
      event.snapshot.body_html !== state.snapshot.body_html ||
      event.snapshot.asset_ids.join(',') !== state.snapshot.asset_ids.join(',');
    return {
      ...state,
      snapshot: event.snapshot,
      hasConfirmedLocalEdit: hasMeaningfulChange ? true : state.hasConfirmedLocalEdit,
      syncStatus: hasMeaningfulChange
        ? state.source.fragment?.is_local_draft
          ? 'syncing'
          : state.syncStatus === 'synced'
            ? 'idle'
            : state.syncStatus
        : state.syncStatus,
      errorMessage: null,
      phase: state.phase === 'saving' ? 'saving' : resolveSessionPhase(state),
    };
  }

  if (event.type === 'SELECTION_CHANGED') {
    return {
      ...state,
      selectionText: event.text.trim(),
    };
  }

  if (event.type === 'FORMATTING_CHANGED') {
    return {
      ...state,
      formattingState: event.formattingState,
    };
  }

  if (event.type === 'IMAGE_UPLOADED') {
    return {
      ...state,
      mediaAssets: appendRuntimeMediaAsset(state.mediaAssets, event.asset),
      errorMessage: null,
    };
  }

  if (event.type === 'AI_PATCH_APPLIED') {
    const nextSnapshot = applyAiPatchFallbackToSnapshot(
      state.snapshot,
      event.patch,
      state.selectionText
    );
    return {
      ...state,
      snapshot: nextSnapshot,
      hasConfirmedLocalEdit: true,
      syncStatus: state.source.fragment?.is_local_draft ? 'syncing' : 'idle',
      errorMessage: null,
      phase: resolveSessionPhase(state),
    };
  }

  if (event.type === 'SAVE_REQUESTED') {
    return {
      ...state,
      saveRequestId: state.saveRequestId + 1,
    };
  }

  if (event.type === 'SAVE_STARTED') {
    return {
      ...state,
      phase: 'saving',
      syncStatus: 'syncing',
      errorMessage: null,
    };
  }

  if (event.type === 'LOCAL_SAVE_SUCCEEDED') {
    const normalizedSavedHtml = normalizeBodyHtml(event.savedHtml);
    const nextSnapshot = buildFragmentEditorSnapshot(normalizedSavedHtml);
    const nextFragment = event.fragment ?? state.source.fragment;
    const nextBaseline: SessionBaseline | null = state.baseline
      ? {
          ...state.baseline,
          snapshot: nextSnapshot,
          remote_baseline: normalizedSavedHtml,
          media_assets: nextFragment?.media_assets ?? state.mediaAssets,
          sync_status: 'unsynced',
        }
      : null;
    return {
      ...state,
      baseline: nextBaseline,
      snapshot: nextSnapshot,
      mediaAssets: nextFragment
        ? mergeVisibleMediaAssets(nextFragment.media_assets, state.mediaAssets)
        : state.mediaAssets,
      syncStatus: 'unsynced',
      hasConfirmedLocalEdit: false,
      errorMessage: null,
      source: {
        ...state.source,
        draft_html: normalizedSavedHtml,
        fragment: nextFragment,
      },
      phase: resolveSessionPhase({
        ...state,
        baseline: nextBaseline,
        snapshot: nextSnapshot,
        errorMessage: null,
      }),
    };
  }

  if (event.type === 'SAVE_SUCCEEDED') {
    const normalizedSavedHtml = normalizeBodyHtml(event.savedHtml);
    const nextSnapshot = buildFragmentEditorSnapshot(normalizedSavedHtml);
    const nextFragment = event.fragment ?? state.source.fragment;
    const nextBaseline: SessionBaseline | null = state.baseline
      ? {
          ...state.baseline,
          snapshot: nextSnapshot,
          remote_baseline: normalizedSavedHtml,
          media_assets: nextFragment?.media_assets ?? state.mediaAssets,
          sync_status: 'synced',
        }
      : null;
    return {
      ...state,
      baseline: nextBaseline,
      snapshot: nextSnapshot,
      mediaAssets: nextFragment
        ? mergeVisibleMediaAssets(nextFragment.media_assets, state.mediaAssets)
        : state.mediaAssets,
      syncStatus: 'synced',
      hasConfirmedLocalEdit: false,
      errorMessage: null,
      source: {
        ...state.source,
        draft_html: null,
        fragment: nextFragment,
      },
      phase: resolveSessionPhase({
        ...state,
        baseline: nextBaseline,
        snapshot: nextSnapshot,
        errorMessage: null,
      }),
    };
  }

  return {
    ...state,
    syncStatus: 'unsynced',
    errorMessage: event.message,
    hasConfirmedLocalEdit: true,
    phase: 'error',
    baseline: state.baseline
      ? {
          ...state.baseline,
          remote_baseline: normalizeBodyHtml(state.baseline.remote_baseline),
        }
      : null,
    snapshot: buildFragmentEditorSnapshot(event.attemptedHtml),
  };
}
