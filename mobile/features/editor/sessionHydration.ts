/**
 * 编辑器会话 Hydration 逻辑
 *
 * 包含编辑器会话初始化、刷新、素材合并等 hydration 相关的核心逻辑。
 */

import {
  applyHtmlPatchToBody,
  createImageHtml,
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  normalizeBodyHtml,
  type HtmlPatch,
} from '@/features/editor/html';
import {
  areAssetIdsEqual,
  collectMediaAssetIds,
  hasMeaningfulBody,
  resolveLocalDraftSyncStatus,
} from './sessionUtils';
import type {
  EditorDocumentSnapshot,
  EditorMediaAsset,
  EditorPersistenceMode,
  EditorSaveState,
  EditorSessionBaseline,
  EditorSessionPhase,
  EditorSourceDocument,
} from './types';
import type { EditorSessionState } from './sessionState';

/*把正文 HTML 统一规整成编辑器快照。 */
export function buildEditorDocumentSnapshot(html: string): EditorDocumentSnapshot {
  const normalized = normalizeBodyHtml(html);
  return {
    body_html: normalized,
    plain_text: extractPlainTextFromHtml(normalized),
    asset_ids: extractAssetIdsFromHtml(normalized),
  };
}

/*统一计算编辑器的初始正文、远端基线和同步态。 */
export function resolveHydratedEditorDocument({
  document,
  draftHtml,
  cachedBodyHtml,
}: {
  document: EditorSourceDocument;
  draftHtml: string | null;
  cachedBodyHtml: string | null;
}): {
  snapshot: EditorDocumentSnapshot;
  remoteBaseline: string;
  syncStatus: EditorSaveState;
} {
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

/*仅在没有本地编辑负担时，才允许远端详情重建当前编辑会话。 */
export function shouldRehydrateEditorSession({
  document,
  draftHtml,
  currentSnapshot,
  remoteBaseline,
  visibleMediaAssets,
  hasConfirmedLocalEdit,
}: {
  document: EditorSourceDocument;
  draftHtml: string | null;
  currentSnapshot: EditorDocumentSnapshot;
  remoteBaseline: string;
  visibleMediaAssets: EditorMediaAsset[];
  hasConfirmedLocalEdit: boolean;
}): boolean {
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

/*详情页可见素材以服务端顺序为主，再补齐运行态新增素材。 */
export function mergeVisibleMediaAssets(
  documentMediaAssets: EditorMediaAsset[] | null | undefined,
  runtimeMediaAssets: EditorMediaAsset[]
): EditorMediaAsset[] {
  const merged = [...(documentMediaAssets ?? [])];
  for (const asset of runtimeMediaAssets) {
    if (!merged.some((item) => item.id === asset.id)) merged.push(asset);
  }
  return merged;
}

/*只有正文或素材列表真正变化时才更新可见文档。 */
export function shouldCommitOptimisticDocument(
  document: EditorSourceDocument,
  snapshot: EditorDocumentSnapshot,
  visibleMediaAssets: EditorMediaAsset[]
): boolean {
  const currentHtml = normalizeBodyHtml(document.body_html);
  const currentAssetIds = collectMediaAssetIds(document.media_assets ?? []);
  const nextAssetIds = collectMediaAssetIds(visibleMediaAssets);
  return currentHtml !== snapshot.body_html || !areAssetIdsEqual(currentAssetIds, nextAssetIds);
}

/*若空正文仅像初始化异常而非用户操作，则阻止其污染本地和远端状态。 */
export function shouldProtectSuspiciousEmptySnapshot({
  snapshot,
  remoteBaseline,
  hasLocalDraft,
  hasConfirmedLocalEdit,
}: {
  snapshot: EditorDocumentSnapshot;
  remoteBaseline: string;
  hasLocalDraft: boolean;
  hasConfirmedLocalEdit: boolean;
}): boolean {
  if (hasLocalDraft) return false;
  if (hasConfirmedLocalEdit) return false;
  return !hasMeaningfulBody(snapshot.body_html) && hasMeaningfulBody(remoteBaseline);
}

/*新增素材只保留一份，并维持用户插图顺序。 */
export function appendRuntimeMediaAsset(
  currentAssets: EditorMediaAsset[],
  nextAsset: EditorMediaAsset
): EditorMediaAsset[] {
  if (currentAssets.some((item) => item.id === nextAsset.id)) return currentAssets;
  return [...currentAssets, nextAsset];
}

/*当富文本桥不可用时，回退到 HTML 字符串 patch。 */
export function applyHtmlPatchFallbackToSnapshot(
  snapshot: EditorDocumentSnapshot,
  patch: HtmlPatch,
  selectionText: string
): EditorDocumentSnapshot {
  return buildEditorDocumentSnapshot(
    applyHtmlPatchToBody(snapshot.body_html, patch, selectionText)
  );
}

/*桥接不可用时回退为在 HTML 末尾追加一张图片。 */
export function appendImageToSnapshot(
  snapshot: EditorDocumentSnapshot,
  asset: EditorMediaAsset
): EditorDocumentSnapshot {
  const imageHtml = `<p>${createImageHtml(asset.id, String(asset.original_filename ?? ''))}</p>`;
  const nextHtml = snapshot.body_html ? `${snapshot.body_html}${imageHtml}` : imageHtml;
  return buildEditorDocumentSnapshot(nextHtml);
}

/*把草稿、缓存和远端详情解析为唯一初始化基线。 */
export function resolveEditorSessionBaseline(options: {
  document: EditorSourceDocument;
  draftHtml: string | null;
  cachedBodyHtml: string | null;
  persistenceMode: EditorPersistenceMode;
}): EditorSessionBaseline {
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

/*根据 hydrate 和 bridge 就绪度推导当前会话阶段。 */
export function resolveSessionPhase(state: EditorSessionState): EditorSessionPhase {
  if (state.errorMessage) return 'error';
  if (!state.documentId) return 'booting';
  if (!state.isDraftHydrated || !state.isEditorReady) return 'hydrating';
  return 'ready';
}

/*在输入源变化后决定是初始化、刷新还是仅同步素材基线。 */
export function reconcileHydration(state: EditorSessionState): EditorSessionState {
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
      ...currentBaseline!,
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