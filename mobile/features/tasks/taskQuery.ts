import { QueryObserver, type QueryObserverResult, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  assertTaskScopeActive,
  isTaskScopeActive,
  type TaskExecutionScope,
} from '@/features/auth/taskScope';
import type { TaskRun } from '@/types/task';

import { fetchTaskRun, isTaskTerminal } from './api';
import { appQueryClient } from './queryClient';
import {
  buildTaskRunQueryKey,
  isTaskRunUiPhaseTerminal,
  resolveTaskRunRefetchInterval,
  resolveTaskRunUiPhase,
  type TaskRunUiPhase,
} from './taskQueryState';

interface TaskRunQueryOptions {
  enabled?: boolean;
  intervalMs?: number;
  scope?: TaskExecutionScope | null;
}

interface ObserveTaskRunOptions extends TaskRunQueryOptions {
  timeoutMs?: number;
  onTerminal: (task: TaskRun) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

interface TaskRunQuerySnapshot {
  data?: TaskRun;
  error: Error | null;
  phase: TaskRunUiPhase;
}

interface TaskRunTerminalConsumerContext {
  isCancelled: () => boolean;
}

interface UseTaskRunTerminalConsumerOptions<TPending> {
  pending: TPending | null;
  taskRunId: string | null | undefined;
  taskQuery: TaskRunQuerySnapshot;
  onTerminal: (
    pending: TPending,
    task: TaskRun,
    context: TaskRunTerminalConsumerContext
  ) => void | Promise<void>;
  onError?: (
    pending: TPending,
    error: Error,
    context: TaskRunTerminalConsumerContext
  ) => void | Promise<void>;
  onSettled?: (pending: TPending, context: TaskRunTerminalConsumerContext) => void | Promise<void>;
}

export function useTaskRunQuery(
  taskId: string | null | undefined,
  options: TaskRunQueryOptions = {}
) {
  const enabled = Boolean(taskId) && options.enabled !== false;
  const intervalMs = options.intervalMs ?? 800;
  const scope = options.scope;

  const query = useQuery({
    queryKey: buildTaskRunQueryKey(taskId, scope),
    enabled,
    queryFn: async () => {
      if (!taskId) {
        throw new Error('缺少任务 ID');
      }
      if (scope) {
        assertTaskScopeActive(scope);
      }
      const task = await fetchTaskRun(taskId);
      if (scope) {
        assertTaskScopeActive(scope);
      }
      return task;
    },
    refetchInterval: (queryState) =>
      resolveTaskRunRefetchInterval({
        enabled,
        intervalMs,
        scopeActive: scope ? isTaskScopeActive(scope) : undefined,
        task: queryState.state.data,
      }),
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    phase: resolveTaskRunUiPhase({
      enabled,
      isPending: query.isPending,
      status: query.data?.status,
    }),
  };
}

function createTaskRunObserver(taskId: string, options: TaskRunQueryOptions) {
  const enabled = options.enabled !== false;
  const intervalMs = options.intervalMs ?? 800;
  const scope = options.scope;

  return new QueryObserver(appQueryClient, {
    queryKey: buildTaskRunQueryKey(taskId, scope),
    enabled,
    queryFn: async () => {
      if (scope) {
        assertTaskScopeActive(scope);
      }
      const task = await fetchTaskRun(taskId);
      if (scope) {
        assertTaskScopeActive(scope);
      }
      return task;
    },
    refetchInterval: (queryState) =>
      resolveTaskRunRefetchInterval({
        enabled,
        intervalMs,
        scopeActive: scope ? isTaskScopeActive(scope) : undefined,
        task: queryState.state.data,
      }),
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
  });
}

function normalizeTaskObserverError(error: unknown): Error {
  /*把 observer 抛出的未知异常统一收敛成 Error，便于上层回传日志和 UI。 */
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export function useTaskRunTerminalConsumer<TPending>(
  options: UseTaskRunTerminalConsumerOptions<TPending>
): void {
  /*统一消费任务 query 的终态和异常，避免页面层重复写 handled ref 与收尾 effect。 */
  const handledTaskRef = useRef<string | null>(null);
  const {
    pending,
    taskRunId,
    taskQuery,
    onTerminal,
    onError,
    onSettled,
  } = options;

  useEffect(() => {
    if (!pending || !taskRunId || !taskQuery.data || !isTaskRunUiPhaseTerminal(taskQuery.phase)) {
      return;
    }
    if (handledTaskRef.current === taskRunId) {
      return;
    }

    handledTaskRef.current = taskRunId;
    let cancelled = false;
    const context: TaskRunTerminalConsumerContext = {
      isCancelled: () => cancelled,
    };

    void (async () => {
      try {
        await onTerminal(pending, taskQuery.data as TaskRun, context);
      } catch (error) {
        if (!cancelled) {
          await onError?.(pending, normalizeTaskObserverError(error), context);
        }
      } finally {
        if (!cancelled) {
          await onSettled?.(pending, context);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onError, onSettled, onTerminal, pending, taskQuery.data, taskQuery.phase, taskRunId]);

  useEffect(() => {
    if (!pending || !taskRunId || !taskQuery.error) {
      return;
    }
    if (handledTaskRef.current === taskRunId) {
      return;
    }

    handledTaskRef.current = taskRunId;
    let cancelled = false;
    const context: TaskRunTerminalConsumerContext = {
      isCancelled: () => cancelled,
    };

    void (async () => {
      try {
        await onError?.(pending, taskQuery.error as Error, context);
      } finally {
        if (!cancelled) {
          await onSettled?.(pending, context);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onError, onSettled, pending, taskQuery.error, taskRunId]);

  useEffect(() => {
    if (!pending || !taskRunId) {
      handledTaskRef.current = null;
    }
  }, [pending, taskRunId]);
}

function maybeHandleTaskObserverResult(
  result: QueryObserverResult<TaskRun, Error>,
  handleTerminal: (task: TaskRun) => void | Promise<void>,
  handleError?: (error: Error) => void | Promise<void>
): void {
  /*收到终态或错误时立即把结果交给上层，不让各调用点重复判断 query 结构。 */
  if (result.error) {
    void handleError?.(normalizeTaskObserverError(result.error));
    return;
  }
  if (result.data && isTaskTerminal(result.data.status)) {
    void handleTerminal(result.data);
  }
}

export function observeTaskRunUntilTerminal(
  taskId: string,
  options: ObserveTaskRunOptions
): () => void {
  /*在非 React 场景里复用 QueryObserver 轮询 task，直到终态或超时。 */
  const observer = createTaskRunObserver(taskId, options);
  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: () => void = () => {};

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    unsubscribe();
  };

  unsubscribe = observer.subscribe((result) => {
    if (stopped) {
      return;
    }
    if (result.error || (result.data && isTaskTerminal(result.data.status))) {
      stop();
      maybeHandleTaskObserverResult(result, options.onTerminal, options.onError);
    }
  });

  timeoutId = setTimeout(() => {
    stop();
    void options.onError?.(new Error('任务执行超时，请稍后在任务页重试'));
  }, options.timeoutMs ?? 180_000);

  void observer
    .refetch()
    .then((result) => {
      if (stopped) {
        return;
      }
      if (result.error || (result.data && isTaskTerminal(result.data.status))) {
        stop();
        maybeHandleTaskObserverResult(result, options.onTerminal, options.onError);
      }
    })
    .catch((error) => {
      if (stopped) {
        return;
      }
      stop();
      void options.onError?.(normalizeTaskObserverError(error));
    });

  return stop;
}

export async function awaitTaskRunTerminal(
  taskId: string,
  options: TaskRunQueryOptions & { timeoutMs?: number } = {}
): Promise<TaskRun> {
  /*给异步 helper 提供 promise 风格的终态等待，但底层轮询仍统一走 QueryObserver。 */
  return await new Promise<TaskRun>((resolve, reject) => {
    const stop = observeTaskRunUntilTerminal(taskId, {
      ...options,
      timeoutMs: options.timeoutMs,
      onTerminal: async (task) => {
        stop();
        resolve(task);
      },
      onError: async (error) => {
        stop();
        reject(error);
      },
    });
  });
}
