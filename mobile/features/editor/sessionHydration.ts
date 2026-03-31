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
} from './sessionUtils';
import type {
  EditorDocumentSnapshot,
  EditorMediaAsset,
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

/*统一计算编辑器的初始正文、基线正文和保存态。 */
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
  baselineBodyHtml: string;
  syncStatus: EditorSaveState;
} {
  const nextHtml = normalizeBodyHtml(draftHtml ?? document.body_html);
  const snapshot = buildEditorDocumentSnapshot(nextHtml);
  const baselineBodyHtml =
    normalizeBodyHtml(cachedBodyHtml) ||
    (draftHtml == null ? normalizeBodyHtml(document.body_html) : '');
  return {
    snapshot,
    baselineBodyHtml,
    syncStatus: snapshot.body_html === baselineBodyHtml ? 'synced' : 'idle',
  };
}

/*仅在没有本地编辑负担时，才允许来源文档重建当前编辑会话。 */
export function shouldRehydrateEditorSession({
  document,
  draftHtml,
  currentSnapshot,
  baselineBodyHtml,
  visibleMediaAssets,
  hasConfirmedLocalEdit,
}: {
  document: EditorSourceDocument;
  draftHtml: string | null;
  currentSnapshot: EditorDocumentSnapshot;
  baselineBodyHtml: string;
  visibleMediaAssets: EditorMediaAsset[];
  hasConfirmedLocalEdit: boolean;
}): boolean {
  if (draftHtml !== null) return false;
  if (hasConfirmedLocalEdit) return false;
  if (normalizeBodyHtml(currentSnapshot.body_html) !== normalizeBodyHtml(baselineBodyHtml)) {
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

/*若空正文仅像初始化异常而非用户操作，则阻止其污染本地与来源文档状态。 */
export function shouldProtectSuspiciousEmptySnapshot({
  snapshot,
  baselineBodyHtml,
  hasLocalDraft,
  hasConfirmedLocalEdit,
}: {
  snapshot: EditorDocumentSnapshot;
  baselineBodyHtml: string;
  hasLocalDraft: boolean;
  hasConfirmedLocalEdit: boolean;
}): boolean {
  if (hasLocalDraft) return false;
  if (hasConfirmedLocalEdit) return false;
  return !hasMeaningfulBody(snapshot.body_html) && hasMeaningfulBody(baselineBodyHtml);
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

/*把草稿、缓存和来源文档解析为唯一初始化基线。 */
export function resolveEditorSessionBaseline(options: {
  document: EditorSourceDocument;
  draftHtml: string | null;
  cachedBodyHtml: string | null;
}): EditorSessionBaseline {
  const hydrated = resolveHydratedEditorDocument({
    document: options.document,
    draftHtml: options.draftHtml,
    cachedBodyHtml: options.cachedBodyHtml,
  });
  return {
    document_id: options.document.id,
    snapshot: hydrated.snapshot,
    baseline_body_html: hydrated.baselineBodyHtml,
    cached_baseline_html: options.cachedBodyHtml,
    local_draft_html: options.draftHtml,
    media_assets: options.document.media_assets ?? [],
    save_state: options.document.legacy_save_state ?? hydrated.syncStatus,
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
  if (!document || !state.source.local_draft_loaded) {
    return {
      ...state,
      phase: state.isEditorReady ? 'hydrating' : 'booting',
    };
  }

  const baseline = resolveEditorSessionBaseline({
    document,
    draftHtml: state.source.local_draft_html,
    cachedBodyHtml: state.source.cached_baseline_html,
  });
  const currentBaseline = state.baseline;
  const shouldInitialize = !currentBaseline || currentBaseline.document_id !== document.id;
  const shouldRefresh = !shouldInitialize && currentBaseline
    ? shouldRehydrateEditorSession({
        document,
        draftHtml: state.source.local_draft_html,
        currentSnapshot: state.snapshot,
        baselineBodyHtml: currentBaseline.baseline_body_html,
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
      syncStatus: baseline.save_state,
      isDraftHydrated: true,
      hasConfirmedLocalEdit: Boolean(baseline.local_draft_html),
      errorMessage: null,
      phase: state.isEditorReady ? 'ready' : 'hydrating',
    };
  }

  const nextSyncStatus =
    document.legacy_save_state ??
    (state.source.local_draft_html === null &&
    normalizeBodyHtml(document.body_html) === normalizeBodyHtml(state.snapshot.body_html)
      ? 'synced'
      : state.syncStatus);

  return {
    ...state,
    baseline: {
      ...currentBaseline!,
      cached_baseline_html: baseline.cached_baseline_html,
      media_assets: document.media_assets ?? [],
      save_state: nextSyncStatus,
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
