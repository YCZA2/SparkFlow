import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  deleteFragment,
  fetchFragmentDetail,
  fetchFragmentVisualization,
  fetchFragments as fetchFragmentsRemote,
} from '@/features/fragments/api';
import {
  mergeLocalDraftsIntoFragments,
} from '@/features/fragments/localDraftState';
import { wakeFragmentSyncQueue } from '@/features/fragments/localFragmentSyncQueue';
import {
  listLocalFragmentDrafts,
  readCachedRemoteFragmentList,
  readRemoteFragmentSnapshot,
  upsertRemoteFragmentSnapshot,
  writeCachedRemoteFragmentList,
} from '@/features/fragments/store';
import { useFragmentStore, useFragmentList, useLocalDrafts } from '@/features/fragments/store/fragmentStore';
import { consumeFragmentsStale } from '@/features/fragments/refreshSignal';
import type {
  Fragment,
  FragmentVisualizationResponse,
  LocalFragmentDraft,
} from '@/types/fragment';
import { getErrorMessage } from '@/utils/error';

interface UseFragmentsOptions {
  folderId?: string | null;
}

export function useFragments({ folderId }: UseFragmentsOptions = {}) {
  /*列表页优先消费本地缓存，再静默刷新远端结果。 */
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedFolderId =
    typeof folderId === 'string' && folderId.trim() && folderId !== '__all__'
      ? folderId
      : undefined;

  /*从 Zustand Store 读取缓存，自动响应式*/
  const remoteFragments = useFragmentList(resolvedFolderId ?? null) ?? [];
  const localDrafts = useLocalDrafts(resolvedFolderId ?? null) ?? [];

  const fragments = useMemo(() => {
    const remoteById = new Map(remoteFragments.map((item) => [item.id, item]));
    return mergeLocalDraftsIntoFragments(remoteFragments, localDrafts, remoteById);
  }, [localDrafts, remoteFragments]);

  const applyCachedList = useCallback(async (): Promise<boolean> => {
    const cached = await readCachedRemoteFragmentList(resolvedFolderId);
    if (!cached) return false;
    /*Zustand Store 自动更新，无需手动 setState*/
    setError(null);
    setIsLoading(false);
    return true;
  }, [resolvedFolderId]);

  const hydrateLocalDrafts = useCallback(async () => {
    const drafts = await listLocalFragmentDrafts(resolvedFolderId);
    /*更新 Zustand Store*/
    useFragmentStore.getState().setLocalDrafts(resolvedFolderId ?? null, drafts);
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
        /*Zustand Store 自动更新列表缓存*/
        await writeCachedRemoteFragmentList(nextItems, resolvedFolderId);
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
      const [hasCache] = await Promise.all([applyCachedList(), hydrateLocalDrafts()]);
      if (cancelled) return;
      await loadFragments(hasCache ? 'silent' : 'load');
    };

    void hydrate();

    /*Zustand 自动响应式，无需手动订阅*/

    return () => {
      cancelled = true;
    };
  }, [applyCachedList, hydrateLocalDrafts, loadFragments, resolvedFolderId]);

  useFocusEffect(
    useCallback(() => {
      void wakeFragmentSyncQueue().catch(() => undefined);
      if (consumeFragmentsStale()) {
        /*同时刷新本地草稿和远端碎片，确保新建碎片立即显示。 */
        void hydrateLocalDrafts();
        void loadFragments('load');
      }
    }, [hydrateLocalDrafts, loadFragments])
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
            const cached = await readRemoteFragmentSnapshot(id);
            if (cached) {
              return cached;
            }
            const fragment = await fetchFragmentDetail(id);
            await upsertRemoteFragmentSnapshot(fragment);
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

export { deleteFragment, fetchFragmentDetail };
