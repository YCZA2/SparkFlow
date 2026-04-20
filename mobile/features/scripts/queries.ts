import { useQuery } from '@tanstack/react-query';

import {
  buildWorkspaceQueryKey,
  getCurrentWorkspaceQueryScope,
  useWorkspaceQueryScope,
} from '@/features/core/query/workspace';
import { appQueryClient } from '@/features/tasks/queryClient';
import type { Script } from '@/types/script';

import { ensureScriptStoreReady, listLocalScriptEntities, readLocalScriptEntity } from './store';

function resolveScriptListCacheKey(sourceFragmentId?: string | null, includeTrashed?: boolean): string {
  /*把脚本列表筛选条件序列化成稳定字符串，供 query key 和测试复用。 */
  const sourcePart = sourceFragmentId ? `source:${sourceFragmentId}` : 'all';
  const trashPart = includeTrashed ? 'with-trash' : 'active-only';
  return `${sourcePart}:${trashPart}`;
}

export function buildScriptQueryPrefix() {
  /*按当前工作区生成 script 查询前缀，供失效与清缓存复用。 */
  return buildWorkspaceQueryKey(getCurrentWorkspaceQueryScope(), 'scripts');
}

export function buildScriptListQueryKey(options?: {
  sourceFragmentId?: string | null;
  includeTrashed?: boolean;
}) {
  /*脚本列表统一按来源碎片和回收站开关区分缓存。 */
  return [
    ...buildScriptQueryPrefix(),
    'list',
    resolveScriptListCacheKey(options?.sourceFragmentId, options?.includeTrashed),
  ] as const;
}

export function buildScriptDetailQueryKey(scriptId: string) {
  /*单条 script 详情统一挂到 detail key，便于编辑和生成回写。 */
  return [...buildScriptQueryPrefix(), 'detail', scriptId] as const;
}

export function clearScriptQueryCache(): void {
  /*删除 script 相关缓存，让恢复与切号后重新按本地真值读取。 */
  appQueryClient.removeQueries({ queryKey: buildScriptQueryPrefix() });
}

export async function invalidateScriptQueries(): Promise<void> {
  /*script 真值变化后统一失效列表、详情和下游统计查询。 */
  await appQueryClient.invalidateQueries({ queryKey: buildScriptQueryPrefix() });
}

export function setScriptDetailQueryData(script: Script): void {
  /*编辑器乐观提交时直接覆盖当前成稿详情 query，避免保存后正文回跳。 */
  appQueryClient.setQueryData(buildScriptDetailQueryKey(script.id), script);
}

export function useLocalScriptListQuery(options?: {
  sourceFragmentId?: string | null;
  includeTrashed?: boolean;
}) {
  /*本地 script 列表统一通过 React Query 读取 SQLite 真值。 */
  const scope = useWorkspaceQueryScope();

  return useQuery({
    queryKey: buildWorkspaceQueryKey(
      scope,
      'scripts',
      'list',
      resolveScriptListCacheKey(options?.sourceFragmentId, options?.includeTrashed)
    ),
    enabled: Boolean(scope.userId),
    queryFn: async () => {
      await ensureScriptStoreReady();
      return await listLocalScriptEntities(options);
    },
  });
}

export function useLocalScriptDetailQuery(scriptId?: string | null) {
  /*script 详情统一从本地真值读取，必要时再由上层补远端 hydration。 */
  const scope = useWorkspaceQueryScope();

  return useQuery({
    queryKey: buildWorkspaceQueryKey(scope, 'scripts', 'detail', scriptId ?? '__missing__'),
    enabled: Boolean(scope.userId && scriptId),
    queryFn: async () => {
      await ensureScriptStoreReady();
      return scriptId ? await readLocalScriptEntity(scriptId) : null;
    },
  });
}
