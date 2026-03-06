import { useCallback, useState } from 'react';

import {
  fetchDailyPush,
  fetchScripts,
  forceTriggerDailyPush,
  generateScript,
  triggerDailyPush,
} from '@/features/scripts/api';
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

export function useTodayDailyPush() {
  const [script, setScript] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const nextScript = await fetchDailyPush();
      setScript(nextScript);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载每日推盘失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    script,
    isLoading,
    error,
    reload,
  };
}

export function useDailyPushTrigger() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    try {
      setStatus('loading');
      setError(null);
      const script = await triggerDailyPush();
      setStatus('success');
      return script;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : '生成灵感卡片失败');
      throw err;
    }
  }, []);

  return {
    status,
    error,
    run,
  };
}

export function useForceDailyPushTrigger() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    try {
      setStatus('loading');
      setError(null);
      const script = await forceTriggerDailyPush();
      setStatus('success');
      return script;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : '强制生成灵感卡片失败');
      throw err;
    }
  }, []);

  return {
    status,
    error,
    run,
  };
}
