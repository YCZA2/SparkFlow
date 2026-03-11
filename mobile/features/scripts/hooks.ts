import { useCallback, useState } from 'react';

import { waitForPipelineTerminal } from '@/features/pipelines/api';
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

  /**
   创建脚本任务后轮询 pipeline，成功时返回最终脚本 ID。
   */
  const run = async (fragmentIds: string[], mode: ScriptMode): Promise<string> => {
    try {
      setStatus('loading');
      setError(null);
      const task = await generateScript({
        fragment_ids: fragmentIds,
        mode,
      });
      const pipeline = await waitForPipelineTerminal(task.pipeline_run_id);
      const scriptId =
        pipeline.status === 'succeeded' && pipeline.resource.resource_type === 'script'
          ? pipeline.resource.resource_id
          : null;
      if (!scriptId) {
        throw new Error(pipeline.error_message || '生成失败');
      }
      setStatus('success');
      return scriptId;
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
  /**
   拉取脚本列表并适配给通用异步列表状态。
   */
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

  /**
   重新加载今日推盘脚本。
   */
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

  /**
   触发一次今日推盘生成。
   */
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

  /**
   强制触发今日推盘生成。
   */
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
