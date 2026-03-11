import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchFragmentDetail } from '@/features/fragments/api';
import { loadFragmentBodyDraft } from '@/features/fragments/bodyDrafts';
import {
  readFragmentCache,
  subscribeFragmentCache,
  writeFragmentCache,
} from '@/features/fragments/fragmentRepository';
import { applyDraftToFragment } from '@/features/fragments/fragmentCacheState';
import type { Fragment } from '@/types/fragment';

interface UseFragmentDetailResourceResult {
  fragment: Fragment | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  commitRemoteFragment: (fragment: Fragment) => Promise<void>;
  commitOptimisticFragment: (fragment: Fragment) => Promise<void>;
}

async function resolveVisibleFragment(fragmentId: string): Promise<Fragment | null> {
  /** 中文注释：读取缓存并叠加本地草稿，让详情首屏优先展示用户最近编辑内容。 */
  const [cachedEntry, draftMarkdown] = await Promise.all([
    readFragmentCache(fragmentId),
    loadFragmentBodyDraft(fragmentId),
  ]);
  return applyDraftToFragment(cachedEntry?.fragment ?? null, draftMarkdown);
}

export function useFragmentDetailResource(fragmentId?: string | null): UseFragmentDetailResourceResult {
  /** 中文注释：封装碎片详情的缓存秒开、草稿可见态和远端刷新，供页面层纯消费。 */
  const [fragment, setFragment] = useState<Fragment | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(fragmentId));
  const [error, setError] = useState<string | null>(null);
  const hasVisibleFragmentRef = useRef(false);

  const commitFragment = useCallback(async (nextFragment: Fragment) => {
    hasVisibleFragmentRef.current = true;
    setFragment(nextFragment);
    setError(null);
    await writeFragmentCache(nextFragment);
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
        const [remoteFragment, draftMarkdown] = await Promise.all([
          fetchFragmentDetail(fragmentId),
          loadFragmentBodyDraft(fragmentId),
        ]);
        hasVisibleFragmentRef.current = true;
        setError(null);
        setFragment(applyDraftToFragment(remoteFragment, draftMarkdown));
        await writeFragmentCache(remoteFragment);
      } catch (err) {
        const nextError = err instanceof Error ? err.message : '加载失败';
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
        await loadRemote({ silent: true });
        return;
      }
      await loadRemote();
    };

    void hydrate();

    const unsubscribe = subscribeFragmentCache(() => {
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
    commitRemoteFragment: commitFragment,
    commitOptimisticFragment: commitFragment,
  };
}
