import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchFragmentDetail } from '@/features/fragments/api';
import {
  buildFragmentFromLocalDraft,
} from '@/features/fragments/localDraftState';
import { refreshFragmentRemoteSnapshot, wakeFragmentSyncQueue } from '@/features/fragments/localFragmentSyncQueue';
import {
  loadLocalFragmentDraft,
  peekRemoteFragmentSnapshot,
  readRemoteFragmentSnapshot,
  upsertRemoteFragmentSnapshot,
} from '@/features/fragments/store';
import { useFragmentStore } from '@/features/fragments/store/fragmentStore';
import { applyDraftToFragment } from '@/features/fragments/fragmentCacheState';
import type { Fragment } from '@/types/fragment';
import { getErrorMessage } from '@/utils/error';

interface UseFragmentDetailResourceResult {
  fragment: Fragment | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  commitRemoteFragment: (fragment: Fragment) => Promise<void>;
  commitOptimisticFragment: (fragment: Fragment) => Promise<void>;
}

async function resolveVisibleFragment(fragmentId: string): Promise<Fragment | null> {
  /*读取缓存并叠加本地草稿，让详情首屏优先展示用户最近编辑内容。 */
  const draft = await loadLocalFragmentDraft(fragmentId);
  if (draft) {
    const remoteFragment = draft.server_id ? peekRemoteFragmentSnapshot(draft.server_id) ?? null : null;
    return buildFragmentFromLocalDraft(draft, remoteFragment);
  }

  const cachedEntry = await readRemoteFragmentSnapshot(fragmentId);
  return applyDraftToFragment(cachedEntry ?? null, null);
}

export function useFragmentDetailResource(fragmentId?: string | null): UseFragmentDetailResourceResult {
  /*封装碎片详情的缓存秒开、草稿可见态和远端刷新，供页面层纯消费。 */
  const [fragment, setFragment] = useState<Fragment | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(fragmentId));
  const [error, setError] = useState<string | null>(null);
  const hasVisibleFragmentRef = useRef(false);

  const commitVisibleFragment = useCallback(async (nextFragment: Fragment) => {
    hasVisibleFragmentRef.current = true;
    setFragment(nextFragment);
    setError(null);
  }, []);

  const commitRemoteFragment = useCallback(async (nextFragment: Fragment) => {
    /*只有服务端确认后的碎片才回写远端镜像，避免 optimistic 本地输入污染基线。 */
    hasVisibleFragmentRef.current = true;
    setFragment(nextFragment);
    setError(null);
    if (!nextFragment.server_id) return;
    await upsertRemoteFragmentSnapshot(nextFragment);
  }, []);

  const loadRemote = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!fragmentId) {
        hasVisibleFragmentRef.current = false;
        setFragment(null);
        setError('无效的碎片ID');
        setIsLoading(false);
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }

      try {
        // 先尝试加载本地草稿
        const draft = await loadLocalFragmentDraft(fragmentId);
        if (draft) {
          await wakeFragmentSyncQueue().catch(() => undefined);
          if (draft.server_id) {
            await refreshFragmentRemoteSnapshot(fragmentId).catch(() => undefined);
          }
          const nextFragment = await resolveVisibleFragment(fragmentId);
          hasVisibleFragmentRef.current = true;
          setError(null);
          setFragment(nextFragment);
          return;
        }

        // 否则从远程加载
        const remoteFragment = await fetchFragmentDetail(fragmentId);
        await upsertRemoteFragmentSnapshot(remoteFragment);
        hasVisibleFragmentRef.current = true;
        setError(null);
        setFragment(applyDraftToFragment(remoteFragment, null));
      } catch (err) {
        const nextError = getErrorMessage(err, '加载失败');
        if (!hasVisibleFragmentRef.current) {
          setError(nextError);
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [fragmentId]
  );

  useEffect(() => {
    if (!fragmentId) {
      hasVisibleFragmentRef.current = false;
      setFragment(null);
      setError('无效的碎片ID');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      const cached = await resolveVisibleFragment(fragmentId);
      if (cancelled) return;
      if (cached) {
        hasVisibleFragmentRef.current = true;
        setFragment(cached);
        setError(null);
        setIsLoading(false);
        return;
      }
      await loadRemote();
    };

    void hydrate();

    /*使用 Zustand 订阅状态变化*/
    const unsubscribe = useFragmentStore.subscribe(() => {
      void (async () => {
        const cached = await resolveVisibleFragment(fragmentId);
        if (!cached || cancelled) return;
        hasVisibleFragmentRef.current = true;
        setFragment(cached);
        setError(null);
        setIsLoading(false);
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [fragmentId, loadRemote]);

  return {
    fragment,
    isLoading,
    error,
    reload: useCallback(async () => {
      await loadRemote();
    }, [loadRemote]),
    commitRemoteFragment,
    commitOptimisticFragment: commitVisibleFragment,
  };
}
