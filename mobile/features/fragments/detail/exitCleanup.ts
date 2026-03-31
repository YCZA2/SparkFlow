import type { FragmentCleanupTicket } from '@/features/fragments/cleanup/cleanupTicket';
import { isEmptyManualPlaceholderFragment } from '@/features/fragments/cleanup/policy';
import type { EditorDocumentSnapshot } from '@/features/editor/types';
import type { Fragment } from '@/types/fragment';

import type { FragmentDetailCleanupOnReturn } from './cleanupOnReturn';

/*统一解析碎片详情移除时是否登记 cleanup ticket；显式删除后的返回会跳过这次登记。 */
export function resolveFragmentDetailCleanupTicket(input: {
  skipCleanupTicket: boolean;
  fragmentId?: string | null;
  fragment: Fragment | null;
  cleanupOnReturn: FragmentDetailCleanupOnReturn;
  createdAtMs: number;
  currentSnapshot?: EditorDocumentSnapshot | null;
}): FragmentCleanupTicket | null {
  if (input.skipCleanupTicket) {
    return null;
  }

  if (!input.fragmentId || input.cleanupOnReturn !== 'empty_manual_placeholder') {
    return null;
  }

  const candidateFragment = buildCleanupCandidateFragment(input.fragment, input.currentSnapshot);
  if (!isEmptyManualPlaceholderFragment(candidateFragment)) {
    return null;
  }

  return {
    fragmentId: input.fragmentId,
    kind: 'empty_manual_placeholder',
    created_at_ms: input.createdAtMs,
  };
}

function buildCleanupCandidateFragment(
  fragment: Fragment | null,
  currentSnapshot?: EditorDocumentSnapshot | null
): Fragment | null {
  if (!fragment) {
    return null;
  }

  if (!currentSnapshot) {
    return fragment;
  }

  return {
    ...fragment,
    body_html: currentSnapshot.body_html,
    plain_text_snapshot: currentSnapshot.plain_text,
    media_assets: currentSnapshot.asset_ids.map((assetId) => ({ id: assetId } as Fragment['media_assets'][number])),
  };
}
