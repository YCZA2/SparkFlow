import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { getErrorMessage } from '@/utils/error';

export interface AsyncListState<T> {
  items: T[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  setItems: Dispatch<SetStateAction<T[]>>;
}

export function useAsyncList<T>(
  loader: () => Promise<T[]>,
  options?: { autoLoad?: boolean }
): AsyncListState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(options?.autoLoad !== false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (mode: 'load' | 'refresh') => {
      try {
        if (mode === 'refresh') {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setError(null);
        const nextItems = await loader();
        setItems(nextItems);
      } catch (err) {
        setError(getErrorMessage(err, '加载失败'));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [loader]
  );

  useEffect(() => {
    if (options?.autoLoad === false) {
      setIsLoading(false);
      return;
    }
    run('load');
  }, [options?.autoLoad, run]);

  const reload = useCallback(async () => {
    await run('load');
  }, [run]);

  const refresh = useCallback(async () => {
    await run('refresh');
  }, [run]);

  return {
    items,
    isLoading,
    isRefreshing,
    error,
    reload,
    refresh,
    setItems,
  };
}
