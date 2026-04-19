import { API_ENDPOINTS } from '@/constants/config';
import { ApiError, get, patch, post } from '@/features/core/api/client';
import type { GenerateScriptRequest, Script, ScriptGenerationTask } from '@/types/script';

/**
 脚本生成入口现在只返回任务句柄，由上层继续轮询 task。
 */
export async function generateScript(data: GenerateScriptRequest): Promise<ScriptGenerationTask> {
  return post<ScriptGenerationTask>(API_ENDPOINTS.SCRIPTS.GENERATE, data);
}

/**
 读取单篇脚本详情。
 */
export async function fetchScriptDetail(id: string): Promise<Script> {
  return get<Script>(API_ENDPOINTS.SCRIPTS.DETAIL(id));
}

/**
 更新脚本正文、标题或状态。
 */
export async function updateScript(
  id: string,
  patchPayload: {
    body_html?: string;
    title?: string;
    status?: 'draft' | 'ready' | 'filmed';
  }
): Promise<Script> {
  return patch<Script>(API_ENDPOINTS.SCRIPTS.DETAIL(id), patchPayload);
}

/**
 读取今日推盘，没有时返回 null。
 */
export async function fetchDailyPush(): Promise<Script | null> {
  try {
    return await get<Script>(API_ENDPOINTS.SCRIPTS.DAILY_PUSH);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

/**
 触发今日推盘生成。
 */
export async function triggerDailyPush(): Promise<ScriptGenerationTask> {
  return post<ScriptGenerationTask>(API_ENDPOINTS.SCRIPTS.TRIGGER_DAILY_PUSH, {});
}

/**
 忽略聚合约束强制生成今日推盘。
 */
export async function forceTriggerDailyPush(): Promise<ScriptGenerationTask> {
  return post<ScriptGenerationTask>(API_ENDPOINTS.SCRIPTS.FORCE_TRIGGER_DAILY_PUSH, {});
}

/**
 更新脚本状态。
 */
export async function updateScriptStatus(
  id: string,
  status: 'draft' | 'ready' | 'filmed'
): Promise<Script> {
  return updateScript(id, { status });
}
