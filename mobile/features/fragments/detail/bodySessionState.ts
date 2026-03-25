import {
  appendRuntimeMediaAsset,
  applyHtmlPatchFallbackToSnapshot,
  mergeVisibleMediaAssets,
  shouldCommitOptimisticDocument,
  shouldProtectSuspiciousEmptySnapshot,
  shouldRehydrateEditorSession,
  resolveHydratedEditorDocument,
} from '@/features/editor/sessionState';
import type { HtmlPatch } from '@/features/editor/html';
import type { EditorDocumentSnapshot } from '@/features/editor/types';
import type { Fragment, MediaAsset } from '@/types/fragment';

export {
  appendRuntimeMediaAsset,
  mergeVisibleMediaAssets,
  shouldProtectSuspiciousEmptySnapshot,
};

export function resolveHydratedBodySession(input: {
  fragment: Fragment;
  draftHtml: string | null;
  cachedBodyHtml: string | null;
}) {
  /*碎片详情复用共享 hydrate 优先级逻辑。 */
  return resolveHydratedEditorDocument({
    document: input.fragment,
    draftHtml: input.draftHtml,
    cachedBodyHtml: input.cachedBodyHtml,
  });
}

export function shouldRehydrateBodySession(input: {
  fragment: Fragment;
  draftHtml: string | null;
  currentSnapshot: EditorDocumentSnapshot;
  baselineBodyHtml: string;
  visibleMediaAssets: MediaAsset[];
  hasConfirmedLocalEdit: boolean;
}): boolean {
  /*碎片详情复用共享远端刷新判定。 */
  return shouldRehydrateEditorSession({
    document: input.fragment,
    draftHtml: input.draftHtml,
    currentSnapshot: input.currentSnapshot,
    baselineBodyHtml: input.baselineBodyHtml,
    visibleMediaAssets: input.visibleMediaAssets,
    hasConfirmedLocalEdit: input.hasConfirmedLocalEdit,
  });
}

export function buildOptimisticFragmentSnapshot(
  fragment: Fragment,
  snapshot: EditorDocumentSnapshot,
  mediaAssets: MediaAsset[]
): Fragment {
  /*把当前编辑结果合成为页面展示态 fragment。 */
  return {
    ...fragment,
    body_html: snapshot.body_html,
    plain_text_snapshot: snapshot.plain_text,
    media_assets: mediaAssets,
  };
}

export function applyAiPatchFallbackToSnapshot(
  snapshot: EditorDocumentSnapshot,
  patch: HtmlPatch,
  selectionText: string
): EditorDocumentSnapshot {
  /*碎片详情在极端情况下仍可回退到共享 HTML patch。 */
  return applyHtmlPatchFallbackToSnapshot(snapshot, patch, selectionText);
}
