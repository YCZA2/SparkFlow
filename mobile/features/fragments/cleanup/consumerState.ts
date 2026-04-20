import type { Fragment } from '@/types/fragment';

import { FRAGMENT_CLEANUP_SETTLE_MS } from './constants';
import type { FragmentCleanupTicket } from './cleanupTicket';
import { isEmptyManualPlaceholderFragment } from './policy';

export type FragmentCleanupResolution =
  | { action: 'skip' }
  | { action: 'clear'; fragmentId: string }
  | { action: 'defer'; fragmentId: string; delay_ms: number }
  | { action: 'delete'; fragmentId: string; shouldAnimate: boolean };

/*计算保存落盘缓冲期剩余时间，避免刚退出详情时误删仍在保存的手写碎片。 */
function resolveCleanupSettleDelay(
  ticket: FragmentCleanupTicket,
  nowMs: number
): number {
  return Math.max(FRAGMENT_CLEANUP_SETTLE_MS - (nowMs - ticket.created_at_ms), 0);
}

/*统一解析待处理 cleanup ticket；列表页只通过 visibleFragments 启用可见性与动画语义。 */
export function resolveFragmentCleanup(
  ticket: FragmentCleanupTicket | null,
  fragment: Fragment | null,
  options?: { nowMs?: number; visibleFragments?: Pick<Fragment, 'id'>[] }
): FragmentCleanupResolution {
  if (!ticket) {
    return { action: 'skip' };
  }

  if (ticket.kind !== 'empty_manual_placeholder') {
    return { action: 'clear', fragmentId: ticket.fragmentId };
  }

  if (!fragment) {
    return { action: 'clear', fragmentId: ticket.fragmentId };
  }

  const settleDelayMs = resolveCleanupSettleDelay(ticket, options?.nowMs ?? Date.now());

  if (!isEmptyManualPlaceholderFragment(fragment)) {
    if (fragment.source === 'manual' && settleDelayMs > 0) {
      return { action: 'defer', fragmentId: ticket.fragmentId, delay_ms: settleDelayMs };
    }
    return { action: 'clear', fragmentId: ticket.fragmentId };
  }

  const visibleFragments = options?.visibleFragments;
  if (visibleFragments && !visibleFragments.some((item) => item.id === ticket.fragmentId)) {
    return { action: 'skip' };
  }

  return {
    action: 'delete',
    fragmentId: ticket.fragmentId,
    shouldAnimate: Boolean(visibleFragments),
  };
}
