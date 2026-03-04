/**
 * 全局配置文件
 * 包含 API 地址、应用配置等常量
 */

import { Platform } from 'react-native';
import { getBackendUrl, discoverBackendUrl, setBackendUrl } from '@/utils/networkConfig';

// 导出动态获取后端地址的函数
export { getBackendUrl, discoverBackendUrl, setBackendUrl };

// 默认后端地址（用于初始化）
export const DEFAULT_API_BASE_URL = Platform.OS === 'ios'
  ? 'http://localhost:8000'  // iOS 模拟器
  : 'http://10.0.2.2:8000';  // Android 模拟器

// 应用信息
export const APP_NAME = '灵感编导';
export const APP_VERSION = '1.0.0';

// AsyncStorage 键名
export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'user_info',
  REFRESH_TOKEN: 'refresh_token',
  BACKEND_URL: '@backend_url',
} as const;

// API 端点
export const API_ENDPOINTS = {
  AUTH: {
    TOKEN: '/api/auth/token',
    ME: '/api/auth/me',
    REFRESH: '/api/auth/refresh',
  },
  FRAGMENTS: {
    LIST: '/api/fragments',
    DETAIL: (id: string) => `/api/fragments/${id}`,
  },
  TRANSCRIBE: '/api/transcribe',
  SCRIPTS: {
    LIST: '/api/scripts',
    GENERATE: '/api/scripts/generate',
    DETAIL: (id: string) => `/api/scripts/${id}`,
  },
  KNOWLEDGE: '/api/knowledge',
} as const;

// 分页配置
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// 当前使用的 API_BASE_URL（会被动态更新）
// 注意：这是一个变量，实际使用时应该通过 getBackendUrl() 获取
export let API_BASE_URL = DEFAULT_API_BASE_URL;

/**
 * 初始化 API 基础地址
 * 在应用启动时调用，尝试自动发现后端或获取已配置的地址
 */
export async function initApiBaseUrl(): Promise<string> {
  // 首先尝试获取已配置的地址
  const configuredUrl = await getBackendUrl();
  API_BASE_URL = configuredUrl;
  return configuredUrl;
}

/**
 * 更新当前使用的 API_BASE_URL
 */
export function updateApiBaseUrl(url: string): void {
  API_BASE_URL = url;
}
