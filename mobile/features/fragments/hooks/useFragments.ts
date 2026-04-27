import { useCallback, useMemo, useState } from 'react';

import {
  deleteLocalFragmentEntity,
  readLocalFragmentEntity,
} from '@/features/fragments/store';
import {
  isFailedMediaIngestionFragment,
  retryFailedMediaIngestionFragment,
} from '@/features/tasks/mediaIngestionTaskRecovery';
import type {
  Fragment,
} from '@/types/fragment';
import { getErrorMessage } from '@/utils/error';
import {
  useFragmentVisualizationQuery,
  useLocalFragmentListQuery,
  useSelectedFragmentsQuery,
} from '@/features/fragments/queries';

interface UseFragmentsOptions {
  folderId?: string | null;
}

export function useFragments({ folderId }: UseFragmentsOptions = {}) {
  /*列表页统一通过 React Query 读取本地真值，并复用标准 refetch 语义。 */
  const resolvedFolderId =
    typeof folderId === 'string' && folderId.trim() && folderId !== '__all__'
      ? folderId
      : undefined;
  const query = useLocalFragmentListQuery(resolvedFolderId);
  const { refetch } = query;
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const fragments = useMemo(() => query.data ?? [], [query.data]);
  const fetchFragments = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const refreshFragments = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      if (fragments.some(isFailedMediaIngestionFragment)) {
        await Promise.allSettled(
          fragments
            .filter(isFailedMediaIngestionFragment)
            .map(async (fragment) => {
              await retryFailedMediaIngestionFragment(fragment);
            })
        );
      }
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [fragments, refetch]);

  return {
    fragments,
    isLoading: query.isPending,
    isRefreshing: isManualRefreshing,
    error: query.error ? getErrorMessage(query.error, '加载失败') : null,
    total: fragments.length,
    fetchFragments,
    refreshFragments,
  };
}

export function useSelectedFragments(fragmentIds?: string | string[]) {
  /*生成页把已选碎片也统一挂到 React Query，避免再手写批量加载模板代码。 */
  const ids = useMemo(() => {
    if (!fragmentIds) return [];
    if (Array.isArray(fragmentIds)) {
      return fragmentIds
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean);
    }
    return fragmentIds
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }, [fragmentIds]);
  const query = useSelectedFragmentsQuery(ids);

  return {
    ids,
    fragments: query.data ?? [],
    isLoading: ids.length > 0 ? query.isPending : false,
    error: query.error ? getErrorMessage(query.error, '读取碎片失败') : null,
  };
}

export function useFragmentVisualization() {
  /*灵感云图查询改为 React Query 语义，统一 loading/error/refetch 行为。 */
  const query = useFragmentVisualizationQuery();
  const { refetch } = query;
  const reloadVisualization = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    visualization: query.data ?? null,
    isLoading: query.isPending,
    error: query.error ? getErrorMessage(query.error, '读取灵感云图失败') : null,
    reloadVisualization,
  };
}

export const deleteFragment = deleteLocalFragmentEntity;
export const fetchFragmentDetail = readLocalFragmentEntity;
