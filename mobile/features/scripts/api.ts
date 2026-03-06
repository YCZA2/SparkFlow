import { API_ENDPOINTS } from '@/constants/config';
import { ApiError, get, patch, post } from '@/features/core/api/client';
import type { GenerateScriptRequest, Script, ScriptListResponse } from '@/types/script';

export async function generateScript(data: GenerateScriptRequest): Promise<Script> {
  return post<Script>(API_ENDPOINTS.SCRIPTS.GENERATE, data);
}

export async function fetchScripts(): Promise<ScriptListResponse> {
  return get<ScriptListResponse>(API_ENDPOINTS.SCRIPTS.LIST);
}

export async function fetchScriptDetail(id: string): Promise<Script> {
  return get<Script>(API_ENDPOINTS.SCRIPTS.DETAIL(id));
}

export async function fetchDailyPush(): Promise<Script | null> {
  try {
    return await get<Script>(API_ENDPOINTS.SCRIPTS.DAILY_PUSH);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND_ERROR') {
      return null;
    }
    throw error;
  }
}

export async function triggerDailyPush(): Promise<Script> {
  return post<Script>(API_ENDPOINTS.SCRIPTS.TRIGGER_DAILY_PUSH, {});
}

export async function forceTriggerDailyPush(): Promise<Script> {
  return post<Script>(API_ENDPOINTS.SCRIPTS.FORCE_TRIGGER_DAILY_PUSH, {});
}

export async function updateScriptStatus(
  id: string,
  status: 'draft' | 'ready' | 'filmed'
): Promise<Script> {
  return patch<Script>(API_ENDPOINTS.SCRIPTS.DETAIL(id), { status });
}
