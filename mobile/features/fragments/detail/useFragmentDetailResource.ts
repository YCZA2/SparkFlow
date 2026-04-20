import { useCallback } from 'react';

import {
  updateLocalFragmentEntity,
} from '@/features/fragments/store';
import {
  setFragmentDetailQueryData,
  useLocalFragmentDetailQuery,
} from '@/features/fragments/queries';
import type { Fragment } from '@/types/fragment';
import { getErrorMessage } from '@/utils/error';

interface UseFragmentDetailResourceResult {
  fragment: Fragment | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  commitPersistedFragment: (fragment: Fragment) => Promise<void>;
  commitOptimisticFragment: (fragment: Fragment) => Promise<void>;
}

export function useFragmentDetailResource(fragmentId?: string | null): UseFragmentDetailResourceResult {
  /*封装碎片详情的 query 读取和局部乐观提交，供页面层纯消费。 */
  const query = useLocalFragmentDetailQuery(fragmentId);
  const fragment = query.data ?? null;

  const commitVisibleFragment = useCallback(async (nextFragment: Fragment) => {
    setFragmentDetailQueryData(nextFragment);
  }, []);

  const commitPersistedFragment = useCallback(async (nextFragment: Fragment) => {
    /*确认态统一回写本地实体，保证详情与持久层始终同源。 */
    await updateLocalFragmentEntity(nextFragment.id, nextFragment);
    setFragmentDetailQueryData(nextFragment);
  }, []);
  const error =
    !fragmentId
      ? '无效的碎片ID'
      : query.error
        ? getErrorMessage(query.error, '加载失败')
        : query.isFetched && !fragment
          ? '碎片不存在'
          : null;

  return {
    fragment,
    isLoading: Boolean(fragmentId) && query.isPending,
    error,
    reload: async () => {
      await query.refetch();
    },
    commitPersistedFragment,
    commitOptimisticFragment: commitVisibleFragment,
  };
}
