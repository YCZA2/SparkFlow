import type { Fragment } from '@/types/fragment';

import type { FragmentCleanupTicket } from './cleanupTicket';
import { isEmptyManualPlaceholderFragment } from './policy';

export type FragmentCleanupListResolution =
  | { action: 'skip' }
  | { action: 'clear'; fragmentId: string }
  | { action: 'delete_with_animation'; fragmentId: string };

export type FragmentCleanupDirectResolution =
  | { action: 'skip' }
  | { action: 'clear'; fragmentId: string }
  | { action: 'delete'; fragmentId: string };

/*解析当前 fragment 列表页是否应接手待处理 ticket，并决定是否播放退场动画。 */
export function resolveFragmentCleanupForList(
  ticket: FragmentCleanupTicket | null,
  fragments: Pick<Fragment, 'id'>[],
  fragment: Fragment | null
): FragmentCleanupListResolution {
  if (!ticket) {
    return { action: 'skip' };
  }

  if (ticket.kind !== 'empty_manual_placeholder') {
    return { action: 'clear', fragmentId: ticket.fragmentId };
  }

  if (!fragment) {
    return { action: 'clear', fragmentId: ticket.fragmentId };
  }

  if (!isEmptyManualPlaceholderFragment(fragment)) {
    return { action: 'clear', fragmentId: ticket.fragmentId };
  }

  const isVisibleInCurrentList = fragments.some((item) => item.id === ticket.fragmentId);
  if (!isVisibleInCurrentList) {
    return { action: 'skip' };
  }

  return { action: 'delete_with_animation', fragmentId: ticket.fragmentId };
}

/*解析非碎片列表页面是否应直接消费 ticket，避免首页或录音页遗留空占位。 */
export function resolveFragmentCleanupDirect(
  ticket: FragmentCleanupTicket | null,
  fragment: Fragment | null
): FragmentCleanupDirectResolution {
  if (!ticket) {
    return { action: 'skip' };
  }

  if (ticket.kind !== 'empty_manual_placeholder') {
    return { action: 'clear', fragmentId: ticket.fragmentId };
  }

  if (!fragment) {
    return { action: 'clear', fragmentId: ticket.fragmentId };
  }

  if (!isEmptyManualPlaceholderFragment(fragment)) {
    return { action: 'clear', fragmentId: ticket.fragmentId };
  }

  return { action: 'delete', fragmentId: ticket.fragmentId };
}
