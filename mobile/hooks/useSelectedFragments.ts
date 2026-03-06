import { useEffect, useMemo, useState } from 'react';
import { fetchFragmentDetail } from '@/features/fragments/api';
import type { Fragment } from '@/types/fragment';

export function useSelectedFragments(fragmentIds?: string | string[]) {
  const ids = useMemo(() => {
    if (!fragmentIds) return [];
    if (Array.isArray(fragmentIds)) {
      return fragmentIds.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
    }
    return fragmentIds.split(',').map((value) => value.trim()).filter(Boolean);
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
