import { appQueryClient } from '@/features/tasks/queryClient';

function isFolderWorkspaceQuery(queryKey: readonly unknown[]): boolean {
  /*识别所有工作区内的 folder 查询，避免本地 store 与 query hook 互相导入。 */
  return queryKey[0] === 'workspace' && queryKey[4] === 'folders';
}

export function clearFolderQueryCache(): void {
  /*删除 folder 查询缓存，让恢复和切号后按当前本地真值重读。 */
  appQueryClient.removeQueries({ predicate: (query) => isFolderWorkspaceQuery(query.queryKey) });
}

export async function invalidateFolderQueries(): Promise<void> {
  /*文件夹列表依赖碎片和成稿数量变化，因此统一失效整个前缀。 */
  await appQueryClient.invalidateQueries({ predicate: (query) => isFolderWorkspaceQuery(query.queryKey) });
}
