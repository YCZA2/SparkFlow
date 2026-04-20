import { useQuery } from '@tanstack/react-query';

import {
  buildWorkspaceQueryKey,
  getCurrentWorkspaceQueryScope,
  useWorkspaceQueryScope,
} from '@/features/core/query/workspace';
import { appQueryClient } from '@/features/tasks/queryClient';
import type { FragmentFolder } from '@/types/folder';

import { listLocalFragmentEntities } from '@/features/fragments/store/localEntityStore';
import { countLocalScriptEntities } from '@/features/scripts/store/localEntityStore';

import { listLocalFolders } from './localStore';

export interface FolderListQueryData {
  folders: FragmentFolder[];
  allFragmentsCount: number;
  allScriptsCount: number;
}

export function buildFolderQueryPrefix() {
  /*按当前工作区生成 folder 查询前缀，供失效与清缓存复用。 */
  return buildWorkspaceQueryKey(getCurrentWorkspaceQueryScope(), 'folders');
}

export function clearFolderQueryCache(): void {
  /*删除 folder 查询缓存，让恢复和切号后按当前本地真值重读。 */
  appQueryClient.removeQueries({ queryKey: buildFolderQueryPrefix() });
}

export async function invalidateFolderQueries(): Promise<void> {
  /*文件夹列表依赖碎片和成稿数量变化，因此统一失效整个前缀。 */
  await appQueryClient.invalidateQueries({ queryKey: buildFolderQueryPrefix() });
}

async function fetchFolderListQueryData(): Promise<FolderListQueryData> {
  /*并发读取文件夹列表、碎片数量和成稿数量，供首页和刷新动作共用。 */
  const [folders, fragments, scriptsCount] = await Promise.all([
    listLocalFolders(),
    listLocalFragmentEntities(),
    countLocalScriptEntities(),
  ]);
  return {
    folders,
    allFragmentsCount: fragments.length,
    allScriptsCount: scriptsCount,
  };
}

export function useFolderListQuery() {
  /*首页文件夹区统一通过 React Query 读取本地真值和系统统计。 */
  const scope = useWorkspaceQueryScope();

  return useQuery({
    queryKey: buildWorkspaceQueryKey(scope, 'folders', 'list'),
    enabled: Boolean(scope.userId),
    queryFn: async () => await fetchFolderListQueryData(),
  });
}
