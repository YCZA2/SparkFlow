import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { waitForPipelineTerminal } from '@/features/pipelines/api';
import {
  fetchDailyPush,
  forceTriggerDailyPush,
  generateScript,
  triggerDailyPush,
} from '@/features/scripts/api';
import { consumeScriptsStale, markScriptsStale } from '@/features/scripts/refreshSignal';
import { listLocalScriptEntities, readLocalScriptEntity, upsertLocalScriptEntity } from '@/features/scripts/store';
import { useScriptList, useScriptStore } from '@/features/scripts/store/scriptStore';
import { syncRemoteScriptDetailToLocal, syncRemoteScriptsToLocal } from '@/features/scripts/sync';
import type { Fragment } from '@/types/fragment';
import type { Script, ScriptMode } from '@/types/script';
import { getErrorMessage } from '@/utils/error';

async function resolveScriptFromPipelineTask(
  pipelineRunId: string,
  fallbackMessage: string
): Promise<Script> {
  /*统一消费任务态脚本结果，并在成功后落本地真值。 */
  const pipeline = await waitForPipelineTerminal(pipelineRunId);
  const scriptId =
    pipeline.status === 'succeeded' && pipeline.resource.resource_type === 'script'
      ? pipeline.resource.resource_id
      : null;
  if (!scriptId) {
    throw new Error(pipeline.error_message || fallbackMessage);
  }
  const script = await syncRemoteScriptDetailToLocal(scriptId);
  markScriptsStale();
  return script;
}

export function useGenerateScript() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  /**
   创建脚本任务后轮询 pipeline，成功时返回最终脚本 ID。
   */
  const run = async (
    fragmentIds: string[],
    mode: ScriptMode,
    fragments?: Fragment[]
  ): Promise<string> => {
    try {
      setStatus('loading');
      setError(null);
      const task = await generateScript({
        fragment_ids: fragmentIds,
        fragment_snapshots: (fragments ?? []).map((fragment) => ({
          id: fragment.id,
          body_html: fragment.body_html,
          plain_text_snapshot: fragment.plain_text_snapshot ?? null,
          summary: fragment.summary ?? null,
          tags: fragment.tags ?? [],
          source: fragment.source,
          created_at: fragment.created_at,
        })),
        mode,
      });
      const script = await resolveScriptFromPipelineTask(task.pipeline_run_id, '生成失败');
      setStatus('success');
      return script.id;
    } catch (err) {
      setStatus('error');
      setError(getErrorMessage(err, '生成失败'));
      throw err;
    }
  };

  return {
    status,
    error,
    run,
  };
}

export function useScripts(options?: { sourceFragmentId?: string | null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheKey = useMemo(
    () => (options?.sourceFragmentId ? `source:${options.sourceFragmentId}` : null),
    [options?.sourceFragmentId]
  );
  const cachedScripts = useScriptList(cacheKey) ?? [];
  const items = useMemo(() => cachedScripts, [cachedScripts]);

  const loadScripts = useCallback(
    async (mode: 'load' | 'refresh' | 'silent' = 'load') => {
      const isSilent = mode === 'silent';
      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (!isSilent) {
        setIsLoading(true);
      }

      try {
        const nextItems = await listLocalScriptEntities({ sourceFragmentId: options?.sourceFragmentId });
        useScriptStore.getState().setList(cacheKey, nextItems);
        setError(null);

        if (mode !== 'silent' || nextItems.length === 0) {
          try {
            await syncRemoteScriptsToLocal();
            const refreshedItems = await listLocalScriptEntities({ sourceFragmentId: options?.sourceFragmentId });
            useScriptStore.getState().setList(cacheKey, refreshedItems);
          } catch (syncError) {
            if (nextItems.length === 0) {
              throw syncError;
            }
          }
        }
      } catch (err) {
        setError(getErrorMessage(err, '加载口播稿失败'));
      } finally {
        if (mode === 'refresh') {
          setIsRefreshing(false);
        }
        if (!isSilent) {
          setIsLoading(false);
        }
      }
    },
    [cacheKey, options?.sourceFragmentId]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const nextItems = await listLocalScriptEntities({ sourceFragmentId: options?.sourceFragmentId });
        if (cancelled) return;
        useScriptStore.getState().setList(cacheKey, nextItems);
        setError(null);
        setIsLoading(false);
        if (nextItems.length === 0) {
          await loadScripts('silent');
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, '加载口播稿失败'));
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, loadScripts, options?.sourceFragmentId]);

  useFocusEffect(
    useCallback(() => {
      if (consumeScriptsStale()) {
        void loadScripts('load');
      }
    }, [loadScripts])
  );

  return {
    items,
    isLoading,
    isRefreshing,
    error,
    reload: useCallback(async () => {
      await loadScripts('load');
    }, [loadScripts]),
    refresh: useCallback(async () => {
      await loadScripts('refresh');
    }, [loadScripts]),
  };
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
      if (nextScript) {
        await upsertLocalScriptEntity(nextScript, { backupStatus: 'synced' });
      }
      setScript(nextScript);
    } catch (err) {
      setError(getErrorMessage(err, '加载每日推盘失败'));
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
      const task = await triggerDailyPush();
      const script = await resolveScriptFromPipelineTask(task.pipeline_run_id, '生成灵感卡片失败');
      setStatus('success');
      return script;
    } catch (err) {
      setStatus('error');
      setError(getErrorMessage(err, '生成灵感卡片失败'));
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
      const task = await forceTriggerDailyPush();
      const script = await resolveScriptFromPipelineTask(task.pipeline_run_id, '强制生成灵感卡片失败');
      setStatus('success');
      return script;
    } catch (err) {
      setStatus('error');
      setError(getErrorMessage(err, '强制生成灵感卡片失败'));
      throw err;
    }
  }, []);

  return {
    status,
    error,
    run,
  };
}
