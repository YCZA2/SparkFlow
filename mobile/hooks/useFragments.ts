import { useCallback } from 'react';
import { deleteFragment, fetchFragmentDetail, fetchFragments } from '@/features/fragments/api';
import type { Fragment } from '@/types/fragment';
import { useAsyncList } from './useAsyncList';

export function useFragments() {
  const loadFragments = useCallback(async (): Promise<Fragment[]> => {
    const response = await fetchFragments();
    return response.items || [];
  }, []);

  const list = useAsyncList(loadFragments);

  return {
    fragments: list.items,
    items: list.items,
    isLoading: list.isLoading,
    isRefreshing: list.isRefreshing,
    error: list.error,
    total: list.items.length,
    fetchFragments: list.reload,
    refreshFragments: list.refresh,
    reload: list.reload,
    refresh: list.refresh,
  };
}

export { fetchFragmentDetail, deleteFragment };
