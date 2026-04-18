import { API_ENDPOINTS } from '@/constants/config';
import { assertTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { get, post } from '@/features/core/api/client';
import type {
  RetryTaskRequest,
  TaskRun,
  TaskStepListResponse,
} from '@/types/task';

const TERMINAL_TASK_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

/**
 读取单条 task 运行态，供任务页或轮询逻辑复用。
 */
export async function fetchTaskRun(taskId: string): Promise<TaskRun> {
  return get<TaskRun>(API_ENDPOINTS.TASKS.DETAIL(taskId));
}

/**
 读取 task 的步骤详情，便于失败排障或重试前查看。
 */
export async function fetchTaskSteps(taskId: string): Promise<TaskStepListResponse> {
  return get<TaskStepListResponse>(API_ENDPOINTS.TASKS.STEPS(taskId));
}

/**
 触发失败 task 的重试入口。
 */
export async function retryTaskRun(
  taskId: string,
  request: RetryTaskRequest
): Promise<TaskRun> {
  return post<TaskRun>(API_ENDPOINTS.TASKS.RETRY(taskId), request);
}

/**
 判断当前 task 是否已经进入终态。
 */
export function isTaskTerminal(status: string): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

/**
 轮询 task 直到成功、失败或超时，统一给脚本生成等任务态入口复用。
 */
export async function waitForTaskTerminal(
  taskId: string,
  options: { intervalMs?: number; timeoutMs?: number; scope?: TaskExecutionScope | null } = {}
): Promise<TaskRun> {
  const intervalMs = options.intervalMs ?? 800;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    if (options.scope) {
      assertTaskScopeActive(options.scope);
    }
    const run = await fetchTaskRun(taskId);
    if (options.scope) {
      assertTaskScopeActive(options.scope);
    }
    if (isTaskTerminal(run.status)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('任务执行超时，请稍后在任务页重试');
}
