import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  fetchFragmentVisualization,
} from '@/features/fragments/api';
import {
  deleteLocalFragmentEntity,
  listLocalFragmentEntities,
  readLocalFragmentEntity,
} from '@/features/fragments/store';
import { useFragmentStore, useFragmentList } from '@/features/fragments/store/fragmentStore';
import { consumeFragmentsStale } from '@/features/fragments/refreshSignal';
import type {
  Fragment,
  FragmentVisualizationResponse,
} from '@/types/fragment';
import { getErrorMessage } from '@/utils/error';

interface UseFragmentsOptions {
  folderId?: string | null;
}

export function useFragments({ folderId }: UseFragmentsOptions = {}) {
  /*列表页只消费本地真值，并在失效标记后重新读取本地列表。 */
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedFolderId =
    typeof folderId === 'string' && folderId.trim() && folderId !== '__all__'
      ? folderId
      : undefined;

  const cachedFragments = useFragmentList(resolvedFolderId ?? null) ?? [];
  const fragments = useMemo(() => cachedFragments, [cachedFragments]);

  const loadFragments = useCallback(
    async (mode: 'load' | 'refresh' | 'silent' = 'load'): Promise<void> => {
      const isSilent = mode === 'silent';
      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (!isSilent) {
        setIsLoading(true);
      }

      try {
        const nextItems = await listLocalFragmentEntities(resolvedFolderId);
        useFragmentStore.getState().setList(resolvedFolderId ?? null, nextItems);
        setError(null);
      } catch (err) {
        const nextError = getErrorMessage(err, '加载失败');
        setError(nextError);
      } finally {
        if (mode === 'refresh') {
          setIsRefreshing(false);
        }
        if (!isSilent) {
          setIsLoading(false);
        }
      }
    },
    [resolvedFolderId]
  );

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const nextItems = await listLocalFragmentEntities(resolvedFolderId);
      if (cancelled) return;
      useFragmentStore.getState().setList(resolvedFolderId ?? null, nextItems);
      setError(null);
      setIsLoading(false);
    };

    void hydrate();

    /*Zustand 自动响应式，无需手动订阅*/

    return () => {
      cancelled = true;
    };
  }, [loadFragments, resolvedFolderId]);

  useFocusEffect(
    useCallback(() => {
      if (consumeFragmentsStale()) {
        void loadFragments('load');
      }
    }, [loadFragments])
  );

  return {
    fragments,
    isLoading,
    isRefreshing,
    error,
    total: fragments.length,
    fetchFragments: useCallback(async () => {
      await loadFragments('load');
    }, [loadFragments]),
    refreshFragments: useCallback(async () => {
      await loadFragments('refresh');
    }, [loadFragments]),
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
        const detailList = await Promise.all(
          ids.map(async (id) => {
            const fragment = await readLocalFragmentEntity(id);
            if (!fragment) {
              throw new Error(`碎片不存在: ${id}`);
            }
            return fragment;
          })
        );
        if (!cancelled) {
          setFragments(detailList);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, '读取碎片失败'));
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
      setError(getErrorMessage(err, '读取灵感云图失败'));
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

export const deleteFragment = deleteLocalFragmentEntity;
export const fetchFragmentDetail = readLocalFragmentEntity;
