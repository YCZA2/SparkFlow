import { useCallback } from 'react';
import { fetchScripts } from '@/services/scripts';
import type { Script } from '@/types/script';
import { useAsyncList } from './useAsyncList';

export function useScripts() {
  const loadScripts = useCallback(async (): Promise<Script[]> => {
    const response = await fetchScripts();
    return response.items || [];
  }, []);

  return useAsyncList(loadScripts);
}
