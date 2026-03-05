/**
 * 口播稿服务模块
 */

import { API_ENDPOINTS } from '@/constants/config';
import { get, post } from './client';
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
