import {
  applyHtmlPatchToBody,
  createImageHtml,
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  normalizeBodyHtml,
  type HtmlPatch,
} from '@/features/editor/html';
import type {
  EditorDocumentSnapshot,
  EditorFormattingState,
  EditorMediaAsset,
  EditorPersistenceMode,
  EditorSaveState,
  EditorSessionBaseline,
  EditorSessionPhase,
  EditorSourceDocument,
} from '@/features/editor/types';

interface ResolveHydratedEditorDocumentOptions {
  document: EditorSourceDocument;
  draftHtml: string | null;
  cachedBodyHtml: string | null;
}

interface ShouldRehydrateEditorSessionOptions {
  document: EditorSourceDocument;
  draftHtml: string | null;
  currentSnapshot: EditorDocumentSnapshot;
  remoteBaseline: string;
  visibleMediaAssets: EditorMediaAsset[];
  hasConfirmedLocalEdit: boolean;
}

interface ShouldProtectSuspiciousEmptySnapshotOptions {
  snapshot: EditorDocumentSnapshot;
  remoteBaseline: string;
  hasLocalDraft: boolean;
  hasConfirmedLocalEdit: boolean;
}

interface SessionSourceState {
  document: EditorSourceDocument | null;
  draft_html: string | null;
  draft_loaded: boolean;
  cached_body_html: string | null;
}

export interface EditorSessionState {
  documentId: string | null;
  editorKey: string;
  phase: EditorSessionPhase;
  baseline: EditorSessionBaseline | null;
  snapshot: EditorDocumentSnapshot;
  mediaAssets: EditorMediaAsset[];
  syncStatus: EditorSaveState;
  isEditorReady: boolean;
  isDraftHydrated: boolean;
  hasConfirmedLocalEdit: boolean;
  selectionText: string;
  formattingState: EditorFormattingState | null;
  errorMessage: string | null;
  saveRequestId: number;
  persistenceMode: EditorPersistenceMode;
  source: SessionSourceState;
}

export type EditorSessionEvent =
  | { type: 'RESET_SESSION'; documentId: string | null; persistenceMode: EditorPersistenceMode }
  | { type: 'LOCAL_DRAFT_LOADED'; html: string | null }
  | { type: 'CACHE_LOADED'; html: string | null }
  | { type: 'REMOTE_LOADED'; document: EditorSourceDocument | null }
  | { type: 'EDITOR_READY' }
  | { type: 'SNAPSHOT_CHANGED'; snapshot: EditorDocumentSnapshot }
  | { type: 'SELECTION_CHANGED'; text: string }
  | { type: 'FORMATTING_CHANGED'; formattingState: EditorFormattingState }
  | { type: 'IMAGE_UPLOADED'; asset: EditorMediaAsset }
  | { type: 'SAVE_REQUESTED' }
  | { type: 'SAVE_STARTED' }
  | { type: 'LOCAL_SAVE_SUCCEEDED'; document: EditorSourceDocument | null; savedHtml: string }
  | { type: 'SAVE_SUCCEEDED'; document: EditorSourceDocument | null; savedHtml: string }
  | { type: 'SAVE_FAILED'; attemptedHtml: string; message: string | null };

function collectMediaAssetIds(mediaAssets: EditorMediaAsset[] | null | undefined): string[] {
  /*统一抽取素材 id，用于比较当前展示态是否已同步。 */
  return (mediaAssets ?? []).map((asset) => asset.id);
}

function areAssetIdsEqual(left: string[], right: string[]): boolean {
  /*素材列表按顺序比较，避免图片顺序变化被静默吞掉。 */
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resolveMeaningfulTextLength(html: string | null | undefined): number {
  /*统一按纯文本长度评估正文完整度，避免 HTML 标签干扰比较。 */
  return extractPlainTextFromHtml(html).length;
}

function hasMeaningfulBody(html: string | null | undefined): boolean {
  /*只把真正有正文文本的内容视为可用正文，空白和纯格式不算。 */
  return resolveMeaningfulTextLength(html) > 0;
}

function resolveLocalDraftSyncStatus(document: EditorSourceDocument | null): EditorSaveState {
  /*把本地草稿同步态映射为统一的编辑器保存状态。 */
  if (!document?.is_local_draft) return 'idle';
  if (document.local_sync_status === 'synced') return 'synced';
  if (document.local_sync_status === 'syncing' || document.local_sync_status === 'creating') {
    return 'syncing';
  }
  if (document.local_sync_status === 'failed_pending_retry') return 'unsynced';
  return 'idle';
}

function resolveSessionPhase(state: EditorSessionState): EditorSessionPhase {
  /*根据 hydrate 和 bridge 就绪度推导当前会话阶段。 */
  if (state.errorMessage) return 'error';
  if (!state.documentId) return 'booting';
  if (!state.isDraftHydrated || !state.isEditorReady) return 'hydrating';
  return 'ready';
}

export function buildEditorDocumentSnapshot(html: string): EditorDocumentSnapshot {
  /*把正文 HTML 统一规整成编辑器快照。 */
  const normalized = normalizeBodyHtml(html);
  return {
    body_html: normalized,
    plain_text: extractPlainTextFromHtml(normalized),
    asset_ids: extractAssetIdsFromHtml(normalized),
  };
}

export function resolveHydratedEditorDocument({
  document,
  draftHtml,
  cachedBodyHtml,
}: ResolveHydratedEditorDocumentOptions): {
  snapshot: EditorDocumentSnapshot;
  remoteBaseline: string;
  syncStatus: EditorSaveState;
} {
  /*统一计算编辑器的初始正文、远端基线和同步态。 */
  const nextHtml = normalizeBodyHtml(draftHtml ?? document.body_html);
  const snapshot = buildEditorDocumentSnapshot(nextHtml);
  const remoteBaseline =
    normalizeBodyHtml(cachedBodyHtml) ||
    (draftHtml == null ? normalizeBodyHtml(document.body_html) : '');
  return {
    snapshot,
    remoteBaseline,
    syncStatus: snapshot.body_html === remoteBaseline ? 'synced' : 'idle',
  };
}

export function shouldRehydrateEditorSession({
  document,
  draftHtml,
  currentSnapshot,
  remoteBaseline,
  visibleMediaAssets,
  hasConfirmedLocalEdit,
}: ShouldRehydrateEditorSessionOptions): boolean {
  /*仅在没有本地编辑负担时，才允许远端详情重建当前编辑会话。 */
  if (draftHtml !== null) return false;
  if (hasConfirmedLocalEdit) return false;
  if (normalizeBodyHtml(currentSnapshot.body_html) !== normalizeBodyHtml(remoteBaseline)) {
    return false;
  }

  const incomingSnapshot = buildEditorDocumentSnapshot(document.body_html);
  const incomingAssetIds = collectMediaAssetIds(document.media_assets ?? []);
  const currentAssetIds = collectMediaAssetIds(visibleMediaAssets);
  const bodyChanged = incomingSnapshot.body_html !== currentSnapshot.body_html;
  const mediaChanged = !areAssetIdsEqual(incomingAssetIds, currentAssetIds);

  if (!bodyChanged && !mediaChanged) return false;
  if (incomingSnapshot.plain_text.length > currentSnapshot.plain_text.length) return true;
  if (mediaChanged && incomingAssetIds.length > currentAssetIds.length) return true;
  return bodyChanged;
}

export function mergeVisibleMediaAssets(
  documentMediaAssets: EditorMediaAsset[] | null | undefined,
  runtimeMediaAssets: EditorMediaAsset[]
): EditorMediaAsset[] {
  /*详情页可见素材以服务端顺序为主，再补齐运行态新增素材。 */
  const merged = [...(documentMediaAssets ?? [])];
  for (const asset of runtimeMediaAssets) {
    if (!merged.some((item) => item.id === asset.id)) merged.push(asset);
  }
  return merged;
}

export function shouldCommitOptimisticDocument(
  document: EditorSourceDocument,
  snapshot: EditorDocumentSnapshot,
  visibleMediaAssets: EditorMediaAsset[]
): boolean {
  /*只有正文或素材列表真正变化时才更新可见文档。 */
  const currentHtml = normalizeBodyHtml(document.body_html);
  const currentAssetIds = collectMediaAssetIds(document.media_assets ?? []);
  const nextAssetIds = collectMediaAssetIds(visibleMediaAssets);
  return currentHtml !== snapshot.body_html || !areAssetIdsEqual(currentAssetIds, nextAssetIds);
}

export function shouldProtectSuspiciousEmptySnapshot({
  snapshot,
  remoteBaseline,
  hasLocalDraft,
  hasConfirmedLocalEdit,
}: ShouldProtectSuspiciousEmptySnapshotOptions): boolean {
  /*若空正文仅像初始化异常而非用户操作，则阻止其污染本地和远端状态。 */
  if (hasLocalDraft) return false;
  if (hasConfirmedLocalEdit) return false;
  return !hasMeaningfulBody(snapshot.body_html) && hasMeaningfulBody(remoteBaseline);
}

export function appendRuntimeMediaAsset(
  currentAssets: EditorMediaAsset[],
  nextAsset: EditorMediaAsset
): EditorMediaAsset[] {
  /*新增素材只保留一份，并维持用户插图顺序。 */
  if (currentAssets.some((item) => item.id === nextAsset.id)) return currentAssets;
  return [...currentAssets, nextAsset];
}

export function applyHtmlPatchFallbackToSnapshot(
  snapshot: EditorDocumentSnapshot,
  patch: HtmlPatch,
  selectionText: string
): EditorDocumentSnapshot {
  /*当富文本桥不可用时，回退到 HTML 字符串 patch。 */
  return buildEditorDocumentSnapshot(
    applyHtmlPatchToBody(snapshot.body_html, patch, selectionText)
  );
}

export function createInitialEditorSessionState(
  documentId: string | null,
  persistenceMode: EditorPersistenceMode
): EditorSessionState {
  /*为指定文档构造全新的编辑会话状态。 */
  return {
    documentId,
    editorKey: documentId ?? 'empty',
    phase: documentId ? 'booting' : 'hydrating',
    baseline: null,
    snapshot: buildEditorDocumentSnapshot(''),
    mediaAssets: [],
    syncStatus: 'idle',
    isEditorReady: false,
    isDraftHydrated: false,
    hasConfirmedLocalEdit: false,
    selectionText: '',
    formattingState: null,
    errorMessage: null,
    saveRequestId: 0,
    persistenceMode,
    source: {
      document: null,
      draft_html: null,
      draft_loaded: false,
      cached_body_html: null,
    },
  };
}

export function resolveEditorSessionBaseline(options: {
  document: EditorSourceDocument;
  draftHtml: string | null;
  cachedBodyHtml: string | null;
  persistenceMode: EditorPersistenceMode;
}): EditorSessionBaseline {
  /*把草稿、缓存和远端详情解析为唯一初始化基线。 */
  const hydrated = resolveHydratedEditorDocument({
    document: options.document,
    draftHtml: options.draftHtml,
    cachedBodyHtml: options.cachedBodyHtml,
  });
  return {
    document_id: options.document.id,
    snapshot: hydrated.snapshot,
    remote_baseline: hydrated.remoteBaseline,
    cached_body_html: options.cachedBodyHtml,
    draft_html: options.draftHtml,
    media_assets: options.document.media_assets ?? [],
    persistence_mode: options.persistenceMode,
    sync_status: options.document.is_local_draft
      ? resolveLocalDraftSyncStatus(options.document)
      : hydrated.syncStatus,
  };
}

function reconcileHydration(state: EditorSessionState): EditorSessionState {
  /*在输入源变化后决定是初始化、刷新还是仅同步素材基线。 */
  const document = state.source.document;
  if (!state.documentId) {
    return {
      ...state,
      phase: resolveSessionPhase(state),
    };
  }
  if (!document || !state.source.draft_loaded) {
    return {
      ...state,
      phase: state.isEditorReady ? 'hydrating' : 'booting',
    };
  }

  const baseline = resolveEditorSessionBaseline({
    document,
    draftHtml: state.source.draft_html,
    cachedBodyHtml: state.source.cached_body_html,
    persistenceMode: state.persistenceMode,
  });
  const currentBaseline = state.baseline;
  const shouldInitialize = !currentBaseline || currentBaseline.document_id !== document.id;
  const shouldRefresh = !shouldInitialize && currentBaseline
    ? shouldRehydrateEditorSession({
        document,
        draftHtml: state.source.draft_html,
        currentSnapshot: state.snapshot,
        remoteBaseline: currentBaseline.remote_baseline,
        visibleMediaAssets: state.mediaAssets,
        hasConfirmedLocalEdit: state.hasConfirmedLocalEdit,
      })
    : false;
  const mergedMediaAssets = mergeVisibleMediaAssets(document.media_assets, state.mediaAssets);

  if (shouldInitialize || shouldRefresh) {
    return {
      ...state,
      baseline,
      snapshot: baseline.snapshot,
      mediaAssets: mergeVisibleMediaAssets(document.media_assets, []),
      syncStatus: baseline.sync_status,
      isDraftHydrated: true,
      hasConfirmedLocalEdit: Boolean(baseline.draft_html),
      errorMessage: null,
      phase: state.isEditorReady ? 'ready' : 'hydrating',
    };
  }

  const nextSyncStatus = document.is_local_draft
    ? resolveLocalDraftSyncStatus(document)
    : state.source.draft_html === null &&
        normalizeBodyHtml(document.body_html) === normalizeBodyHtml(state.snapshot.body_html)
      ? 'synced'
      : state.syncStatus;

  return {
    ...state,
    baseline: {
      ...currentBaseline,
      cached_body_html: baseline.cached_body_html,
      media_assets: document.media_assets ?? [],
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

export function shouldPublishOptimisticDocument(state: EditorSessionState): boolean {
  /*仅当正文或素材展示态变化时才回写详情资源层。 */
  if (!state.source.document || !state.documentId || !state.isDraftHydrated) return false;
  const remoteBaseline = state.baseline?.remote_baseline ?? '';
  if (shouldProtectSuspiciousEmptySnapshot({
    snapshot: state.snapshot,
    remoteBaseline,
    hasLocalDraft: state.source.draft_html !== null,
    hasConfirmedLocalEdit: state.hasConfirmedLocalEdit,
  })) {
    return false;
  }
  return shouldCommitOptimisticDocument(
    state.source.document,
    state.snapshot,
    state.mediaAssets
  );
}

export function appendImageToSnapshot(
  snapshot: EditorDocumentSnapshot,
  asset: EditorMediaAsset
): EditorDocumentSnapshot {
  /*桥接不可用时回退为在 HTML 末尾追加一张图片。 */
  const imageHtml = `<p>${createImageHtml(asset.id, String(asset.original_filename ?? ''))}</p>`;
  const nextHtml = snapshot.body_html ? `${snapshot.body_html}${imageHtml}` : imageHtml;
  return buildEditorDocumentSnapshot(nextHtml);
}

export function reduceEditorSession(
  state: EditorSessionState,
  event: EditorSessionEvent
): EditorSessionState {
  /*用单向事件流收敛正文会话状态，避免副作用互相覆盖。 */
  if (event.type === 'RESET_SESSION') {
    return createInitialEditorSessionState(event.documentId, event.persistenceMode);
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
        document: event.document,
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
        ? state.source.document?.is_local_draft
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
    const nextSnapshot = buildEditorDocumentSnapshot(normalizedSavedHtml);
    const nextDocument = event.document ?? state.source.document;
    const nextBaseline: EditorSessionBaseline | null = state.baseline
      ? {
          ...state.baseline,
          snapshot: nextSnapshot,
          remote_baseline: normalizedSavedHtml,
          media_assets: nextDocument?.media_assets ?? state.mediaAssets,
          sync_status: 'unsynced',
        }
      : null;
    return {
      ...state,
      baseline: nextBaseline,
      snapshot: nextSnapshot,
      mediaAssets: nextDocument
        ? mergeVisibleMediaAssets(nextDocument.media_assets, state.mediaAssets)
        : state.mediaAssets,
      syncStatus: 'unsynced',
      hasConfirmedLocalEdit: false,
      errorMessage: null,
      source: {
        ...state.source,
        draft_html: normalizedSavedHtml,
        document: nextDocument,
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
    const nextSnapshot = buildEditorDocumentSnapshot(normalizedSavedHtml);
    const nextDocument = event.document ?? state.source.document;
    const nextBaseline: EditorSessionBaseline | null = state.baseline
      ? {
          ...state.baseline,
          snapshot: nextSnapshot,
          remote_baseline: normalizedSavedHtml,
          media_assets: nextDocument?.media_assets ?? state.mediaAssets,
          sync_status: 'synced',
        }
      : null;
    return {
      ...state,
      baseline: nextBaseline,
      snapshot: nextSnapshot,
      mediaAssets: nextDocument
        ? mergeVisibleMediaAssets(nextDocument.media_assets, state.mediaAssets)
        : state.mediaAssets,
      syncStatus: 'synced',
      hasConfirmedLocalEdit: false,
      errorMessage: null,
      source: {
        ...state.source,
        draft_html: null,
        document: nextDocument,
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
    snapshot: buildEditorDocumentSnapshot(event.attemptedHtml),
  };
}
