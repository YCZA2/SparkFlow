import { API_ENDPOINTS } from '@/constants/config';
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
