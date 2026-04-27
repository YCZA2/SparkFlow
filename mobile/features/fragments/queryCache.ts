import { appQueryClient } from '@/features/tasks/queryClient';
import type { Fragment } from '@/types/fragment';

function isFragmentWorkspaceQuery(queryKey: readonly unknown[]): boolean {
  /*识别所有工作区内的 fragment 查询，避免缓存工具反向依赖查询 hook。 */
  return queryKey[0] === 'workspace' && queryKey[4] === 'fragments';
}

export function clearFragmentQueryCache(): void {
  /*删除 fragment 相关缓存，让恢复或切号后重新按本地真值读取。 */
  appQueryClient.removeQueries({ predicate: (query) => isFragmentWorkspaceQuery(query.queryKey) });
}

export async function invalidateFragmentQueries(): Promise<void> {
  /*fragment 真值变化后统一失效详情、列表和选中集合查询。 */
  await appQueryClient.invalidateQueries({ predicate: (query) => isFragmentWorkspaceQuery(query.queryKey) });
}

export function setFragmentDetailQueryData(queryKey: readonly unknown[], fragment: Fragment): void {
  /*编辑器乐观提交时直接覆盖指定详情 query，避免首屏闪回旧正文。 */
  appQueryClient.setQueryData(queryKey, fragment);
}
