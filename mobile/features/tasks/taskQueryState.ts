import type { TaskRun, TaskStatus } from '@/types/task';
import type { TaskExecutionScope } from '@/features/auth/taskScope';

export type TaskRunUiPhase = 'idle' | 'loading' | 'polling' | 'succeeded' | 'failed' | 'cancelled';

export function buildTaskRunQueryKey(
  taskId: string | null | undefined,
  scope?: TaskExecutionScope | null
): readonly [string, string, string, string, string] {
  /*把任务 query key 绑定到完整作用域，避免同账号不同会话复用旧缓存。 */
  return [
    'task-run',
    scope?.userId ?? 'anonymous',
    String(scope?.sessionVersion ?? 'null'),
    String(scope?.workspaceEpoch ?? 'none'),
    taskId ?? 'missing',
  ] as const;
}

export function isTaskRunUiPhaseTerminal(phase: TaskRunUiPhase): boolean {
  /*判断统一任务 UI 阶段是否已经进入终态，供页面和公共 hook 复用。 */
  return phase === 'succeeded' || phase === 'failed' || phase === 'cancelled';
}

export function resolveTaskRunUiPhase(input: {
  enabled: boolean;
  isPending: boolean;
  status: TaskStatus | null | undefined;
}): TaskRunUiPhase {
  /*统一把 query 状态和 task 状态映射为页面可直接消费的任务 UI 阶段。 */
  if (!input.enabled) {
    return 'idle';
  }
  if (!input.status) {
    return input.isPending ? 'loading' : 'idle';
  }
  if (input.status === 'succeeded' || input.status === 'failed' || input.status === 'cancelled') {
    return input.status;
  }
  return input.isPending ? 'loading' : 'polling';
}

export function resolveTaskRunRefetchInterval(input: {
  enabled: boolean;
  intervalMs: number;
  scopeActive?: boolean;
  task?: Pick<TaskRun, 'status'> | null;
}): number | false {
  /*统一决定任务查询何时继续轮询，终态或工作区失活后立即停表。 */
  if (!input.enabled) {
    return false;
  }
  if (input.scopeActive === false) {
    return false;
  }
  if (input.task?.status && (input.task.status === 'succeeded' || input.task.status === 'failed' || input.task.status === 'cancelled')) {
    return false;
  }
  return input.intervalMs;
}
