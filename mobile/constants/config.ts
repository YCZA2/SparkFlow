/**
 * 全局配置文件
 * 包含 API 地址、应用配置等常量
 */

import { getDefaultApiBaseUrl } from '@/constants/appConfig';
import { getBackendUrl, discoverBackendUrl, setBackendUrl } from '@/utils/networkConfig';

// 导出动态获取后端地址的函数
export { getBackendUrl, discoverBackendUrl, setBackendUrl };

// 默认后端地址（用于初始化）
export const DEFAULT_API_BASE_URL = getDefaultApiBaseUrl();

// 本地存储键名（包含 AsyncStorage 与 SecureStore）
export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'user_info',
  BACKEND_URL: '@backend_url',
  DEBUG_LOGS: '@debug_logs',
  DEVICE_ID: '@device_id',
  // SecureStore key 只能包含字母数字、.、-、_，不能包含 @。
  DEVICE_SESSION_INVALID: 'device_session_invalid',
} as const;

// API 端点
// 注意：FastAPI 会自动重定向无斜杠 URL，但 307 重定向不保留 Authorization 头
// 所以所有端点必须与后端路由完全匹配（带斜杠）
export const API_ENDPOINTS = {
  AUTH: {
    TOKEN: '/api/auth/token',
    REGISTER: '/api/auth/register',
    LOGIN: '/api/auth/login',
    ME: '/api/auth/me',
    REFRESH: '/api/auth/refresh',
    LOGOUT: '/api/auth/logout',
  },
  BACKUPS: {
    BATCH: '/api/backups/batch',
    SNAPSHOT: '/api/backups/snapshot',
    RESTORE: '/api/backups/restore',
    ASSETS: '/api/backups/assets',
    ASSET_ACCESS: '/api/backups/assets/access',
  },
  FRAGMENTS: {
    AI_EDIT: (id: string) => `/api/fragments/${id}/ai-edit`,
    VISUALIZATION: '/api/fragments/visualization',
    SIMILAR: '/api/fragments/similar',
  },
  MEDIA_ASSETS: '/api/media-assets',
  TRANSCRIPTIONS: '/api/transcriptions',
  SCRIPTS: {
    LIST: '/api/scripts',
    GENERATE: '/api/scripts/generation',
    DAILY_PUSH: '/api/scripts/daily-push',
    TRIGGER_DAILY_PUSH: '/api/scripts/daily-push/trigger',
    FORCE_TRIGGER_DAILY_PUSH: '/api/scripts/daily-push/force-trigger',
    DETAIL: (id: string) => `/api/scripts/${id}`,
  },
  TASKS: {
    DETAIL: (id: string) => `/api/tasks/${id}`,
    STEPS: (id: string) => `/api/tasks/${id}/steps`,
    RETRY: (id: string) => `/api/tasks/${id}/retry`,
  },
  EXTERNAL_MEDIA: {
    AUDIO_IMPORTS: '/api/external-media/audio-imports',
  },
  FOLDERS: {
    LIST: '/api/fragment-folders',
    DETAIL: (id: string) => `/api/fragment-folders/${id}`,
  },
} as const;

/**
 * 初始化 API 基础地址
 * 在应用启动时调用，尝试自动发现后端或获取已配置的地址
 */
export async function initApiBaseUrl(): Promise<string> {
  // 首先尝试获取已配置的地址
  const configuredUrl = await getBackendUrl();
  return configuredUrl;
}
