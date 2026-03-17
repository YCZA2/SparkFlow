import type { Fragment } from '@/types/fragment';

interface ResolveLegacyCloudBindingSessionInput {
  routeFragmentId?: string | null;
  fragment?: Pick<Fragment, 'id' | 'server_id' | 'sync_status'> | null;
}

interface ResolveLegacyCloudBindingSessionResult {
  isLegacyLocalFragment: boolean;
  draftId: string | null;
}

/*统一解析当前详情是否仍需兼容旧云端绑定语义。 */
export function resolveLegacyCloudBindingSession({
  routeFragmentId,
  fragment,
}: ResolveLegacyCloudBindingSessionInput): ResolveLegacyCloudBindingSessionResult {
  const isLegacyLocalFragment = !fragment?.server_id;

  return {
    isLegacyLocalFragment,
    draftId: routeFragmentId ?? fragment?.id ?? null,
  };
}

/*识别旧云端绑定缺失错误，供兼容恢复逻辑判断是否自愈。 */
export function isLegacyCloudBindingMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return 'code' in error && (error as { code?: unknown }).code === 'NOT_FOUND';
}

/*只在首次命中旧绑定 404 时触发恢复，避免兼容逻辑无限重试。 */
export function shouldRecoverLegacyCloudBinding(input: {
  error: unknown;
  legacyServerBindingId: string | null | undefined;
  recoveryAttempted: boolean;
}): boolean {
  return Boolean(input.legacyServerBindingId)
    && !input.recoveryAttempted
    && isLegacyCloudBindingMissingError(input.error);
}

/*旧云端记录已不存在时继续清本地，避免残留兼容数据无法删除。 */
export function shouldIgnoreLegacyCloudDeleteError(input: {
  error: unknown;
  isLegacyLocalFragment: boolean;
  legacyServerBindingId: string | null | undefined;
}): boolean {
  return Boolean(
    input.isLegacyLocalFragment
      && input.legacyServerBindingId
      && isLegacyCloudBindingMissingError(input.error)
  );
}
