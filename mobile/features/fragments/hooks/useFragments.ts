import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  deleteFragment,
  fetchFragmentDetail,
  fetchFragmentVisualization,
  fetchFragments as fetchFragmentsRemote,
} from '@/features/fragments/api';
import {
  listLocalFragmentDrafts,
  mergeLocalDraftsIntoFragments,
  subscribeLocalFragmentDrafts,
} from '@/features/fragments/localDrafts';
import { wakeLocalFragmentSyncQueue } from '@/features/fragments/localFragmentSyncQueue';
import {
  peekFragmentListCache,
  readFragmentListCache,
  subscribeFragmentCache,
  writeFragmentListCache,
} from '@/features/fragments/fragmentRepository';
import { consumeFragmentsStale } from '@/features/fragments/refreshSignal';
import type {
  Fragment,
  FragmentVisualizationResponse,
  LocalFragmentDraft,
} from '@/types/fragment';

interface UseFragmentsOptions {
  folderId?: string | null;
}

export function useFragments({ folderId }: UseFragmentsOptions = {}) {
  /*列表页优先消费本地缓存，再静默刷新远端结果。 */
  const [remoteFragments, setRemoteFragments] = useState<Fragment[]>([]);
  const [localDrafts, setLocalDrafts] = useState<LocalFragmentDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedFolderId =
    typeof folderId === 'string' && folderId.trim() && folderId !== '__all__'
      ? folderId
      : undefined;

  const fragments = useMemo(() => {
    const remoteById = new Map(remoteFragments.map((item) => [item.id, item]));
    return mergeLocalDraftsIntoFragments(remoteFragments, localDrafts, remoteById);
  }, [localDrafts, remoteFragments]);

  const applyCachedList = useCallback(async (): Promise<boolean> => {
    const cached = await readFragmentListCache(resolvedFolderId);
    if (!cached) return false;
    setRemoteFragments(cached.items);
    setError(null);
    setIsLoading(false);
    return true;
  }, [resolvedFolderId]);

  const hydrateLocalDrafts = useCallback(async () => {
    const drafts = await listLocalFragmentDrafts(resolvedFolderId);
    setLocalDrafts(drafts);
    return drafts;
  }, [resolvedFolderId]);

  const loadFragments = useCallback(
    async (mode: 'load' | 'refresh' | 'silent' = 'load'): Promise<void> => {
      const isSilent = mode === 'silent';
      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (!isSilent) {
        setIsLoading(true);
      }

      try {
        const response = await fetchFragmentsRemote(resolvedFolderId);
        const nextItems = response.items || [];
        setRemoteFragments(nextItems);
        setError(null);
        await writeFragmentListCache(nextItems, resolvedFolderId);
      } catch (err) {
        const nextError = err instanceof Error ? err.message : '加载失败';
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
      const [hasCache] = await Promise.all([applyCachedList(), hydrateLocalDrafts()]);
      if (cancelled) return;
      await loadFragments(hasCache ? 'silent' : 'load');
    };

    void hydrate();

    const unsubscribe = subscribeFragmentCache(() => {
      const cached = peekFragmentListCache(resolvedFolderId);
      if (!cached) {
        setRemoteFragments([]);
        return;
      }
      setRemoteFragments(cached.items);
      setError(null);
      setIsLoading(false);
    });

    const unsubscribeLocalDrafts = subscribeLocalFragmentDrafts(() => {
      void hydrateLocalDrafts();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeLocalDrafts();
    };
  }, [applyCachedList, hydrateLocalDrafts, loadFragments, resolvedFolderId]);

  useFocusEffect(
    useCallback(() => {
      void wakeLocalFragmentSyncQueue().catch(() => undefined);
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
