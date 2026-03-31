export type FragmentCleanupTicketKind = 'empty_manual_placeholder';

export interface FragmentCleanupTicket {
  fragmentId: string;
  kind: FragmentCleanupTicketKind;
}

let pendingFragmentCleanupTicket: FragmentCleanupTicket | null = null;

/*登记待消费的碎片返回清理 ticket，供上一页在重新聚焦后统一处理。 */
export function registerFragmentCleanupTicket(ticket: FragmentCleanupTicket): void {
  pendingFragmentCleanupTicket = ticket;
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
