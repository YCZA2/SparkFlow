import type { Fragment } from '@/types/fragment';

interface ResolveLocalDraftSessionInput {
  routeFragmentId?: string | null;
  fragment?: Pick<Fragment, 'id' | 'server_id' | 'sync_status'> | null;
}

interface ResolveLocalDraftSessionResult {
  isLocalDraftSession: boolean;
  draftId: string | null;
}

/*统一解析当前详情是否仍应按本地草稿会话处理。 */
export function resolveLocalDraftSession({
  routeFragmentId,
  fragment,
}: ResolveLocalDraftSessionInput): ResolveLocalDraftSessionResult {
  // 如果没有 server_id，说明是本地草稿
  const isLocalDraftSession = !fragment?.server_id;

  return {
    isLocalDraftSession,
    draftId: routeFragmentId ?? fragment?.id ?? null,
  };
}

/*识别服务端绑定缺失错误，供本地草稿同步队列决定是否自愈。 */
export function isMissingServerBindingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return 'code' in error && (error as { code?: unknown }).code === 'NOT_FOUND';
}

/*只在首次命中服务端 404 时触发重建，避免单次同步无限自旋。 */
export function shouldRecoverMissingServerBinding(input: {
  error: unknown;
  serverId: string | null | undefined;
  recoveryAttempted: boolean;
}): boolean {
  return Boolean(input.serverId) && !input.recoveryAttempted && isMissingServerBindingError(input.error);
}

/*本地草稿删除命中服务端 404 时继续清本地，避免幽灵草稿永远删不掉。 */
export function shouldIgnoreMissingServerDeleteError(input: {
  error: unknown;
  isLocalDraftSession: boolean;
  serverId: string | null | undefined;
}): boolean {
  return Boolean(input.isLocalDraftSession && input.serverId && isMissingServerBindingError(input.error));
}
