import { useQuery } from '@tanstack/react-query';

import {
  buildWorkspaceQueryKey,
  getCurrentWorkspaceQueryScope,
  useWorkspaceQueryScope,
} from '@/features/core/query/workspace';
import { appQueryClient } from '@/features/tasks/queryClient';
import type {
  Fragment,
  FragmentVisualizationResponse,
} from '@/types/fragment';

import { fetchFragmentVisualization } from './api';
import { ensureFragmentStoreReady, listLocalFragmentEntities, readLocalFragmentEntity } from './store';

export function buildFragmentQueryPrefix() {
  /*按当前工作区生成 fragment 查询前缀，供失效与清缓存复用。 */
  return buildWorkspaceQueryKey(getCurrentWorkspaceQueryScope(), 'fragments');
}

export function buildFragmentListQueryKey(folderId?: string | null) {
  /*按文件夹维度区分本地 fragment 列表查询。 */
  return [...buildFragmentQueryPrefix(), 'list', folderId ?? '__all__'] as const;
}

export function buildFragmentDetailQueryKey(fragmentId: string) {
  /*单条 fragment 详情统一挂到独立 detail key，便于编辑后局部更新。 */
  return [...buildFragmentQueryPrefix(), 'detail', fragmentId] as const;
}

export function buildSelectedFragmentsQueryKey(fragmentIds: readonly string[]) {
  /*生成页所需的已选碎片集合用稳定 ids 列表做 key。 */
  return [...buildFragmentQueryPrefix(), 'selected', fragmentIds.join(',')] as const;
}

export function buildFragmentVisualizationQueryKey() {
  /*灵感云图读取也纳入当前工作区隔离的 query key。 */
  return [...buildFragmentQueryPrefix(), 'visualization'] as const;
}

export function clearFragmentQueryCache(): void {
  /*删除 fragment 相关缓存，让恢复或切号后重新按本地真值读取。 */
  appQueryClient.removeQueries({ queryKey: buildFragmentQueryPrefix() });
}

export async function invalidateFragmentQueries(): Promise<void> {
  /*fragment 真值变化后统一失效详情、列表和选中集合查询。 */
  await appQueryClient.invalidateQueries({ queryKey: buildFragmentQueryPrefix() });
}

export function setFragmentDetailQueryData(fragment: Fragment): void {
  /*编辑器乐观提交时直接覆盖当前详情 query，避免首屏闪回旧正文。 */
  appQueryClient.setQueryData(buildFragmentDetailQueryKey(fragment.id), fragment);
}

export function useLocalFragmentListQuery(folderId?: string | null) {
  /*本地 fragment 列表统一通过 React Query 读取 SQLite 真值。 */
  const scope = useWorkspaceQueryScope();
  const resolvedFolderId =
    typeof folderId === 'string' && folderId.trim() && folderId !== '__all__'
      ? folderId
      : undefined;

  return useQuery({
    queryKey: buildWorkspaceQueryKey(scope, 'fragments', 'list', resolvedFolderId ?? '__all__'),
    enabled: Boolean(scope.userId),
    queryFn: async () => {
      await ensureFragmentStoreReady();
      return await listLocalFragmentEntities(resolvedFolderId);
    },
  });
}

export function useLocalFragmentDetailQuery(fragmentId?: string | null) {
  /*fragment 详情统一从本地真值读取，缺失时交给上层决定是否展示错误。 */
  const scope = useWorkspaceQueryScope();

  return useQuery({
    queryKey: buildWorkspaceQueryKey(scope, 'fragments', 'detail', fragmentId ?? '__missing__'),
    enabled: Boolean(scope.userId && fragmentId),
    queryFn: async () => {
      await ensureFragmentStoreReady();
      return fragmentId ? await readLocalFragmentEntity(fragmentId) : null;
    },
  });
}

export function useSelectedFragmentsQuery(fragmentIds: readonly string[]) {
  /*生成页按选中的 ids 批量读取本地碎片详情，并复用统一 query 语义。 */
  const scope = useWorkspaceQueryScope();

  return useQuery({
    queryKey: buildWorkspaceQueryKey(scope, 'fragments', 'selected', fragmentIds.join(',')),
    enabled: Boolean(scope.userId) && fragmentIds.length > 0,
    queryFn: async () => {
      await ensureFragmentStoreReady();
      const detailList = await Promise.all(
        fragmentIds.map(async (id) => {
          const fragment = await readLocalFragmentEntity(id);
          if (!fragment) {
            throw new Error(`碎片不存在: ${id}`);
          }
          return fragment;
        })
      );
      return detailList;
    },
  });
}

export function useFragmentVisualizationQuery() {
  /*灵感云图继续走远端接口，但查询缓存与工作区绑定。 */
  const scope = useWorkspaceQueryScope();

  return useQuery<FragmentVisualizationResponse>({
    queryKey: buildWorkspaceQueryKey(scope, 'fragments', 'visualization'),
    enabled: Boolean(scope.userId),
    queryFn: async () => await fetchFragmentVisualization(),
  });
}
