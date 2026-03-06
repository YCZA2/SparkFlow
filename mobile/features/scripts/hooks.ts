import { useCallback, useState } from 'react';

import { fetchScripts, generateScript } from '@/features/scripts/api';
import { useAsyncList } from '@/hooks/useAsyncList';
import type { Script, ScriptMode } from '@/types/script';

export function useGenerateScript() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = async (fragmentIds: string[], mode: ScriptMode) => {
    try {
      setStatus('loading');
      setError(null);
      const script = await generateScript({
        fragment_ids: fragmentIds,
        mode,
      });
      setStatus('success');
      return script;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : '生成失败');
      throw err;
    }
  };

  return {
    status,
    error,
    run,
  };
}

export function useScripts() {
  const loadScripts = useCallback(async (): Promise<Script[]> => {
    const response = await fetchScripts();
    return response.items || [];
  }, []);

  return useAsyncList(loadScripts);
}
