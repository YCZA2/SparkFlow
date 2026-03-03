/**
 * 全局配置文件
 * 包含 API 地址、应用配置等常量
 */

// 后端地址配置
// 模拟器使用 localhost，真机使用局域网 IP
export const API_BASE_URL = 'http://localhost:8000';

// 应用信息
export const APP_NAME = '灵感编导';
export const APP_VERSION = '1.0.0';

// AsyncStorage 键名
export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'user_info',
  REFRESH_TOKEN: 'refresh_token',
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
