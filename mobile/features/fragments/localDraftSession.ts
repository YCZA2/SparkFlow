import type { Fragment } from '@/types/fragment';

const LOCAL_FRAGMENT_ID_PREFIX = 'local:fragment:';

interface ResolveLocalDraftSessionInput {
  routeFragmentId?: string | null;
  fragment?: Pick<Fragment, 'id' | 'local_id' | 'is_local_draft'> | null;
}

interface ResolveLocalDraftSessionResult {
  isLocalDraftSession: boolean;
  localDraftId: string | null;
}

/*按固定前缀识别本地草稿路由 id，保持详情页会话判定稳定。 */
export function isLocalDraftRouteId(fragmentId?: string | null): boolean {
  return typeof fragmentId === 'string' && fragmentId.startsWith(LOCAL_FRAGMENT_ID_PREFIX);
}

/*统一解析当前详情是否仍应按本地草稿会话处理。 */
export function resolveLocalDraftSession({
  routeFragmentId,
  fragment,
}: ResolveLocalDraftSessionInput): ResolveLocalDraftSessionResult {
  if (isLocalDraftRouteId(routeFragmentId)) {
    return {
      isLocalDraftSession: true,
      localDraftId: routeFragmentId as string,
    };
  }

  if (!fragment?.is_local_draft) {
    return {
      isLocalDraftSession: false,
      localDraftId: null,
    };
  }

  const localDraftId = fragment.local_id ?? (isLocalDraftRouteId(fragment.id) ? fragment.id : null);
  return {
    isLocalDraftSession: Boolean(localDraftId),
    localDraftId,
  };
}

/*识别远端绑定缺失错误，供本地草稿同步队列决定是否自愈。 */
export function isMissingRemoteBindingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return 'code' in error && (error as { code?: unknown }).code === 'NOT_FOUND';
}

/*只在首次命中远端 404 时触发重建，避免单次同步无限自旋。 */
export function shouldRecoverMissingRemoteBinding(input: {
  error: unknown;
  remoteId: string | null | undefined;
  recoveryAttempted: boolean;
}): boolean {
  return Boolean(input.remoteId) && !input.recoveryAttempted && isMissingRemoteBindingError(input.error);
}

/*本地草稿删除命中远端 404 时继续清本地，避免幽灵草稿永远删不掉。 */
export function shouldIgnoreMissingRemoteDeleteError(input: {
  error: unknown;
  isLocalDraftSession: boolean;
  remoteId: string | null | undefined;
}): boolean {
  return Boolean(input.isLocalDraftSession && input.remoteId && isMissingRemoteBindingError(input.error));
}
