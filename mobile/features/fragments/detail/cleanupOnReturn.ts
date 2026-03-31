export type FragmentDetailCleanupOnReturn = 'empty_manual_placeholder' | null;

/*统一解析详情页返回清理策略：默认开启 manual 空碎片清理，显式传 null 时关闭。 */
export function resolveFragmentDetailCleanupOnReturn(
  cleanupOnReturn?: FragmentDetailCleanupOnReturn | undefined
): FragmentDetailCleanupOnReturn {
  return cleanupOnReturn === undefined ? 'empty_manual_placeholder' : cleanupOnReturn;
}
