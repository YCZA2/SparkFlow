import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { captureRequiredTaskExecutionScope } from '@/features/auth/taskScope';
import { flushBackupQueue } from '@/features/backups/queue';
import {
  fetchDailyPush,
  forceTriggerDailyPush,
  generateScript,
  triggerDailyPush,
} from '@/features/scripts/api';
import { consumeScriptsStale } from '@/features/scripts/refreshSignal';
import { rememberPendingScriptTask, type PendingScriptTaskKind } from '@/features/scripts/pendingScriptTasks';
import { listLocalScriptEntities, upsertLocalScriptEntity } from '@/features/scripts/store';
import { useScriptList, useScriptStore } from '@/features/scripts/store/scriptStore';
import { resolveScriptFromTask } from '@/features/scripts/scriptTask';
import type { Script } from '@/types/script';
import { getErrorMessage } from '@/utils/error';

export function useGenerateScript() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  /**
   创建脚本任务后轮询 task，成功时返回最终脚本 ID。
   */
  const run = async (
    fragmentIds: string[],
    topic: string,
  ): Promise<string> => {
    try {
      setStatus('loading');
      setError(null);
      const scope = captureRequiredTaskExecutionScope();
      await flushBackupQueue({ scope }).catch((error) => {
        throw new Error(getErrorMessage(error, '本地内容尚未同步，无法保证生成基于最新正文'));
      });
      const task = await generateScript({
        topic,
        fragment_ids: fragmentIds,
      });
      const taskId = task.task_id;
      await rememberPendingScriptTask(scope.userId, {
        taskRunId: taskId,
        kind: 'manual',
        createdAt: new Date().toISOString(),
      });
      const script = await resolveScriptFromTask(taskId, '生成失败', { scope });
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
  const items = useScriptList(cacheKey) ?? [];

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

function useDailyPushTriggerBase(
  apiFn: () => Promise<{ task_id: string }>,
  errorMessage: string,
  kind: PendingScriptTaskKind
) {
  /* 推盘触发钩子公共逻辑：管理 loading/error 状态，等待 task 完成后返回脚本。*/
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    try {
      setStatus('loading');
      setError(null);
      const scope = captureRequiredTaskExecutionScope();
      const task = await apiFn();
      const taskId = task.task_id;
      await rememberPendingScriptTask(scope.userId, {
        taskRunId: taskId,
        kind,
        createdAt: new Date().toISOString(),
      });
      const script = await resolveScriptFromTask(taskId, errorMessage, { scope });
      setStatus('success');
      return script;
    } catch (err) {
      setStatus('error');
      setError(getErrorMessage(err, errorMessage));
      throw err;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFn, errorMessage, kind]);

  return { status, error, run };
}

export function useDailyPushTrigger() {
  /* 触发一次今日推盘生成。*/
  return useDailyPushTriggerBase(triggerDailyPush, '生成灵感卡片失败', 'daily_push');
}

export function useForceDailyPushTrigger() {
  /* 强制触发今日推盘生成（跳过碎片数量校验）。*/
  return useDailyPushTriggerBase(forceTriggerDailyPush, '强制生成灵感卡片失败', 'daily_push');
}
