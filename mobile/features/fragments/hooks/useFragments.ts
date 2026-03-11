import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  deleteFragment,
  fetchFragmentDetail,
  fetchFragmentVisualization,
  fetchFragments,
} from '@/features/fragments/api';
import { consumeFragmentsStale } from '@/features/fragments/refreshSignal';
import { useAsyncList } from '@/hooks/useAsyncList';
import type { Fragment, FragmentVisualizationResponse } from '@/types/fragment';

export function useFragments() {
  const loadFragments = useCallback(async (): Promise<Fragment[]> => {
    const response = await fetchFragments();
    return response.items || [];
  }, []);

  const list = useAsyncList(loadFragments);

  useFocusEffect(
    useCallback(() => {
      if (consumeFragmentsStale()) {
        void list.reload();
      }
    }, [list])
  );

  return {
    fragments: list.items,
    isLoading: list.isLoading,
    isRefreshing: list.isRefreshing,
    error: list.error,
    total: list.items.length,
    fetchFragments: list.reload,
    refreshFragments: list.refresh,
  };
}

export function useSelectedFragments(fragmentIds?: string | string[]) {
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

  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [isLoading, setIsLoading] = useState(ids.length > 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (ids.length === 0) {
        setFragments([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const detailList = await Promise.all(ids.map((id) => fetchFragmentDetail(id)));
        if (!cancelled) {
          setFragments(detailList);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '读取碎片失败');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [ids]);

  return {
    ids,
    fragments,
    isLoading,
    error,
  };
}

export function useFragmentVisualization() {
  const [visualization, setVisualization] = useState<FragmentVisualizationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVisualization = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetchFragmentVisualization();
      setVisualization(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取灵感云图失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVisualization();
  }, [loadVisualization]);

  return {
    visualization,
    isLoading,
    error,
    reloadVisualization: loadVisualization,
  };
}

export { deleteFragment, fetchFragmentDetail };
