import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchFragmentDetail } from '@/features/fragments/api';
import { loadFragmentBodyDraft } from '@/features/fragments/bodyDrafts';
import {
  peekFragmentCache,
  readFragmentCache,
  subscribeFragmentCache,
  writeFragmentCache,
} from '@/features/fragments/fragmentRepository';
import { applyDraftToFragment } from '@/features/fragments/fragmentCacheState.js';
import type { Fragment } from '@/types/fragment';

interface UseFragmentDetailResult {
  fragment: Fragment | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setFragment: (fragment: Fragment | null) => void;
}

async function resolveCachedFragment(fragmentId: string): Promise<Fragment | null> {
  /** 中文注释：读取详情缓存后叠加本地草稿，保证未同步正文优先展示。 */
  const [cachedEntry, draftMarkdown] = await Promise.all([
    readFragmentCache(fragmentId),
    loadFragmentBodyDraft(fragmentId),
  ]);
  return applyDraftToFragment(cachedEntry?.fragment ?? null, draftMarkdown);
}

export function useFragmentDetail(fragmentId?: string | null): UseFragmentDetailResult {
  /** 中文注释：统一封装详情页缓存秒开和后台刷新的 stale-while-revalidate 行为。 */
  const [fragment, setFragment] = useState<Fragment | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(fragmentId));
  const [error, setError] = useState<string | null>(null);
  const hasVisibleFragmentRef = useRef(false);

  const loadRemote = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!fragmentId) {
        hasVisibleFragmentRef.current = false;
        setError('无效的碎片ID');
        setIsLoading(false);
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }

      try {
        const data = await fetchFragmentDetail(fragmentId);
        hasVisibleFragmentRef.current = true;
        setError(null);
        setFragment(data);
        await writeFragmentCache(data);
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
      const cached = await resolveCachedFragment(fragmentId);
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
      const cached = peekFragmentCache(fragmentId);
      if (!cached) return;
      hasVisibleFragmentRef.current = true;
      setFragment(cached.fragment);
      setError(null);
      setIsLoading(false);
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
    setFragment,
  };
}
