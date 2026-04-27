import { appQueryClient } from '@/features/tasks/queryClient';

export function clearWorkspaceQueryCache(): void {
  /*切换账号工作区时直接清空查询缓存，避免旧账号本地快照残留。 */
  appQueryClient.clear();
}
