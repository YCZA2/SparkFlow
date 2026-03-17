import { useCallback, useEffect, useRef, useState } from 'react';

import {
  readLocalFragmentEntity,
  updateLocalFragmentEntity,
} from '@/features/fragments/store';
import { useFragmentStore } from '@/features/fragments/store/fragmentStore';
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

async function resolveVisibleFragment(fragmentId: string): Promise<Fragment | null> {
  /*详情只读取本地真值，不再依赖远端详情回填。 */
  return await readLocalFragmentEntity(fragmentId);
}

export function useFragmentDetailResource(fragmentId?: string | null): UseFragmentDetailResourceResult {
  /*封装碎片详情的本地读取、可见态提交与重载能力，供页面层纯消费。 */
  const [fragment, setFragment] = useState<Fragment | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(fragmentId));
  const [error, setError] = useState<string | null>(null);
  const hasVisibleFragmentRef = useRef(false);

  const commitVisibleFragment = useCallback(async (nextFragment: Fragment) => {
    hasVisibleFragmentRef.current = true;
    setFragment(nextFragment);
    setError(null);
  }, []);

  const commitPersistedFragment = useCallback(async (nextFragment: Fragment) => {
    /*确认态统一回写本地实体，保证详情与持久层始终同源。 */
    hasVisibleFragmentRef.current = true;
    setFragment(nextFragment);
    setError(null);
    await updateLocalFragmentEntity(nextFragment.id, nextFragment);
  }, []);

  const loadFragment = useCallback(
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
        const visibleFragment = await resolveVisibleFragment(fragmentId);
        if (!visibleFragment) {
          throw new Error('碎片不存在');
        }
        hasVisibleFragmentRef.current = true;
        setError(null);
        setFragment(visibleFragment);
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
      await loadFragment();
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
  }, [fragmentId, loadFragment]);

  return {
    fragment,
    isLoading,
    error,
    reload: useCallback(async () => {
      await loadFragment();
    }, [loadFragment]),
    commitPersistedFragment,
    commitOptimisticFragment: commitVisibleFragment,
  };
}
