import { appQueryClient } from '@/features/tasks/queryClient';
import type { Script } from '@/types/script';

function isScriptWorkspaceQuery(queryKey: readonly unknown[]): boolean {
  /*识别所有工作区内的 script 查询，避免缓存工具反向依赖查询 hook。 */
  return queryKey[0] === 'workspace' && queryKey[4] === 'scripts';
}

export function clearScriptQueryCache(): void {
  /*删除 script 相关缓存，让恢复与切号后重新按本地真值读取。 */
  appQueryClient.removeQueries({ predicate: (query) => isScriptWorkspaceQuery(query.queryKey) });
}

export async function invalidateScriptQueries(): Promise<void> {
  /*script 真值变化后统一失效列表、详情和下游统计查询。 */
  await appQueryClient.invalidateQueries({ predicate: (query) => isScriptWorkspaceQuery(query.queryKey) });
}

export function setScriptDetailQueryData(queryKey: readonly unknown[], script: Script): void {
  /*编辑器乐观提交时直接覆盖指定成稿详情 query，避免保存后正文回跳。 */
  appQueryClient.setQueryData(queryKey, script);
}
