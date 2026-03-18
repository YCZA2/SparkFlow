import { API_ENDPOINTS } from '@/constants/config';
import { get, post } from '@/features/core/api/client';
import type {
  PipelineRun,
  PipelineStepListResponse,
  RetryPipelineRequest,
} from '@/types/pipeline';

const TERMINAL_PIPELINE_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

/**
 读取单条 pipeline 运行态，供任务页或轮询逻辑复用。
 */
export async function fetchPipelineRun(runId: string): Promise<PipelineRun> {
  return get<PipelineRun>(API_ENDPOINTS.PIPELINES.DETAIL(runId));
}

// TODO: 用于未来错误处理 UI
/**
 读取 pipeline 的步骤详情，便于失败排障或重试前查看。
 */
export async function fetchPipelineSteps(runId: string): Promise<PipelineStepListResponse> {
  return get<PipelineStepListResponse>(API_ENDPOINTS.PIPELINES.STEPS(runId));
}

// TODO: 用于未来失败重试功能
/**
 触发失败 pipeline 的重试入口。
 */
export async function retryPipelineRun(
  runId: string,
  request: RetryPipelineRequest
): Promise<PipelineRun> {
  return post<PipelineRun>(API_ENDPOINTS.PIPELINES.RETRY(runId), request);
}

/**
 判断当前 pipeline 是否已经进入终态。
 */
export function isPipelineTerminal(status: string): boolean {
  return TERMINAL_PIPELINE_STATUSES.has(status);
}

/**
 轮询 pipeline 直到成功、失败或超时，统一给脚本生成等任务态入口复用。
 */
export async function waitForPipelineTerminal(
  runId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<PipelineRun> {
  const intervalMs = options.intervalMs ?? 800;
  // 中文注释：默认与后端 Dify 轮询超时对齐，避免服务端仍在执行时前端先误报超时。
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const run = await fetchPipelineRun(runId);
    if (isPipelineTerminal(run.status)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('任务执行超时，请稍后在任务页重试');
}
