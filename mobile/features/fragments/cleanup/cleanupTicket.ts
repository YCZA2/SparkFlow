export type FragmentCleanupTicketKind = 'empty_manual_placeholder';

export interface FragmentCleanupTicket {
  fragmentId: string;
  kind: FragmentCleanupTicketKind;
  created_at_ms: number;
}

let pendingFragmentCleanupTicket: FragmentCleanupTicket | null = null;

/*登记待消费的碎片返回清理 ticket，供上一页在重新聚焦后统一处理。 */
export function registerFragmentCleanupTicket(
  ticket: Omit<FragmentCleanupTicket, 'created_at_ms'> & { created_at_ms?: number }
): void {
  pendingFragmentCleanupTicket = {
    ...ticket,
    created_at_ms: ticket.created_at_ms ?? Date.now(),
  };
}

/*读取当前待处理的清理 ticket，但不立即消费，方便不同页面自行判断是否接手。 */
export function peekFragmentCleanupTicket(): FragmentCleanupTicket | null {
  return pendingFragmentCleanupTicket;
}

/*仅在命中当前 ticket 时清空，避免并发路径把后续新 ticket 误删。 */
export function clearFragmentCleanupTicket(fragmentId?: string): void {
  if (!pendingFragmentCleanupTicket) {
    return;
  }
  if (fragmentId && pendingFragmentCleanupTicket.fragmentId !== fragmentId) {
    return;
  }
  pendingFragmentCleanupTicket = null;
}
