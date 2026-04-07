import * as SecureStore from 'expo-secure-store';

import { API_ENDPOINTS, STORAGE_KEYS, getBackendUrl } from '@/constants/config';
import { createDebugLogEntry, emitDebugLog, serializeForLog } from '@/features/debug-log/store';

/** token 刷新成功后的回调，用于清理设备会话失效标记 */
type TokenRefreshedHandler = () => Promise<void>;
/** 会话彻底失效（401 无法恢复）时的回调，用于清理登录态并通知 UI */
type SessionLostHandler = (reason: string) => Promise<void>;

let _onTokenRefreshed: TokenRefreshedHandler | null = null;
let _onSessionLost: SessionLostHandler | null = null;

export function initApiClientAuth(callbacks: {
  /** token 刷新成功后调用，通知业务层清理失效标记 */
  onTokenRefreshed: TokenRefreshedHandler;
  /** 会话彻底失效时调用，通知业务层清理登录态 */
  onSessionLost: SessionLostHandler;
}): void {
  /*在 AppSessionProvider 初始化时注入，确保 core 层不直接依赖 auth 业务模块。 */
  _onTokenRefreshed = callbacks.onTokenRefreshed;
  _onSessionLost = callbacks.onSessionLost;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string | null;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface RequestConfig extends RequestInit {
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  allowEmptyData?: boolean;
}

export class ApiError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function getCurrentBaseUrl(): Promise<string> {
  const configuredUrl = await getBackendUrl();
  return configuredUrl;
}

export async function setToken(token: string): Promise<void> {
  /*将访问令牌写入系统安全存储，避免明文落地。 */
  await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, token);
}

export async function getToken(): Promise<string | null> {
  /*统一从系统安全存储读取访问令牌。 */
  return await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);
}

export async function clearToken(): Promise<void> {
  /*退出登录或会话失效时清理安全存储中的访问令牌。 */
  await SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN);
}

async function ensureToken(): Promise<string> {
  const token = await getToken();
  if (!token) {
    throw new ApiError('AUTH_REQUIRED', '需要登录后才能继续使用');
  }
  return token;
}

export async function refreshAccessToken(currentToken: string): Promise<string> {
  /*正式登录态下只尝试 refresh，不再自动补测试账号 token。 */
  const baseUrl = await getCurrentBaseUrl();
  const response = await fetch(`${baseUrl}${API_ENDPOINTS.AUTH.REFRESH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${currentToken}`,
    },
  });
  const data: ApiResponse<{ access_token: string }> = await response.json();
  if (!response.ok || !data.success || !data.data?.access_token) {
    throw new ApiError(data.error?.code || 'AUTH_REFRESH_FAILED', data.error?.message || '登录已失效，请重新登录');
  }
  await setToken(data.data.access_token);
  await _onTokenRefreshed?.();
  return data.data.access_token;
}

async function readApiErrorPayload(response: Response): Promise<ApiResponse<unknown>['error'] | null> {
  /*在 401 重试前先探测错误体，避免把设备会话失效误判成 token 过期。 */
  try {
    const data: ApiResponse<unknown> = await response.clone().json();
    return data.error ?? null;
  } catch {
    return null;
  }
}

function isDeviceSessionInvalidError(error: ApiResponse<unknown>['error'] | null): boolean {
  /*单设备模式下，一旦会话被其它设备顶掉，前端必须停留只读本地态。 */
  return (
    error?.code === 'AUTHENTICATION' &&
    typeof error.message === 'string' &&
    error.message.includes('设备会话已失效')
  );
}

function buildHeaders(
  config: RequestConfig,
  authToken?: string,
  contentType?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...config.headers,
  };

  if (config.requiresAuth === false) {
    return headers;
  }

  if (config.headers?.Authorization !== undefined) {
    if (config.headers.Authorization) {
      headers.Authorization = config.headers.Authorization;
    }
    return headers;
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function parseApiResponse<T>(response: Response, config: RequestConfig = {}): Promise<T> {
  if (response.status === 204) {
    return {} as T;
  }

  const data: ApiResponse<T> = await response.json();
  if (!data.success) {
    emitDebugLog(
      createDebugLogEntry({
        level: 'error',
        source: 'api.response',
        message: data.error?.message || '请求失败',
        context: {
          code: data.error?.code || 'UNKNOWN_ERROR',
          details: serializeForLog(data.error?.details),
          status: response.status,
        },
      })
    );
    throw new ApiError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || '请求失败',
      data.error?.details
    );
  }

  if (data.data === null) {
    if (config.allowEmptyData) {
      return null as T;
    }
    throw new ApiError('NO_DATA', '响应数据为空');
  }

  return data.data;
}

async function executeRequest<T>(
  endpoint: string,
  buildRequest: (token?: string) => Promise<RequestInit>
): Promise<T> {
  const baseUrl = await getCurrentBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  try {
    const requestConfig = await buildRequest();
    console.log(`[API] ${requestConfig.method || 'GET'} ${url}`);
    const response = await fetch(url, requestConfig);
    console.log(`[API] 响应状态: ${response.status}`);

    if (response.status === 401) {
      const apiError = await readApiErrorPayload(response);
      if (isDeviceSessionInvalidError(apiError)) {
        const invalidMsg = apiError?.message || '当前设备会话已失效，请重新登录';
        await _onSessionLost?.(invalidMsg);
        throw new ApiError('DEVICE_SESSION_INVALID', invalidMsg);
      }
      const currentToken = await getToken();
      if (!currentToken) {
        throw new ApiError('AUTH_REQUIRED', apiError?.message || '需要登录后才能继续使用');
      }
      try {
        const refreshedToken = await refreshAccessToken(currentToken);
        const retryConfig = await buildRequest(refreshedToken);
        const retryResponse = await fetch(url, retryConfig);
        return await parseApiResponse<T>(retryResponse, retryConfig as RequestConfig);
      } catch (refreshError) {
        const reason = refreshError instanceof ApiError ? refreshError.message : '登录已失效，请重新登录';
        await _onSessionLost?.(reason);
        throw refreshError;
      }
    }

    return await parseApiResponse<T>(response, requestConfig as RequestConfig);
  } catch (error) {
    emitDebugLog(
      createDebugLogEntry({
        level: 'error',
        source: 'api.request',
        message: error instanceof Error ? error : '请求失败',
        context: {
          endpoint,
          url,
        },
      })
    );
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Network'))) {
      throw new ApiError(
        'NETWORK_ERROR',
        '网络连接失败。\n\n请检查：\n1. 后端服务是否已启动\n2. 手机和电脑是否在同一 WiFi 网络\n3. 后端地址配置是否正确\n\n当前地址: ' + baseUrl
      );
    }

    throw new ApiError('UNKNOWN_ERROR', '未知错误: ' + (error as Error).message);
  }
}

export async function fetchApi<T = unknown>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
  config: RequestConfig = {}
): Promise<T> {
  return executeRequest<T>(endpoint, async (overrideToken) => {
    const token = config.requiresAuth === false ? undefined : overrideToken || (await ensureToken());
    const headers = buildHeaders(config, token, 'application/json');
    const requestConfig: RequestInit = {
      method,
      headers,
      ...config,
    };

    if (body !== undefined) {
      requestConfig.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    return requestConfig;
  });
}

export async function sendForm<T = unknown>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH',
  formData: FormData,
  config: RequestConfig = {}
): Promise<T> {
  return executeRequest<T>(endpoint, async (overrideToken) => {
    const token = config.requiresAuth === false ? undefined : overrideToken || (await ensureToken());
    const headers = buildHeaders(config, token);
    delete headers['Content-Type'];

    return {
      method,
      headers,
      body: formData,
      ...config,
    };
  });
}

export function get<T = unknown>(endpoint: string, config?: RequestConfig): Promise<T> {
  return fetchApi<T>(endpoint, 'GET', undefined, config);
}

export function post<T = unknown>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
  return fetchApi<T>(endpoint, 'POST', body, config);
}

export function put<T = unknown>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
  return fetchApi<T>(endpoint, 'PUT', body, config);
}

export function patch<T = unknown>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
  return fetchApi<T>(endpoint, 'PATCH', body, config);
}

export function del<T = unknown>(endpoint: string, config?: RequestConfig): Promise<T> {
  return fetchApi<T>(endpoint, 'DELETE', undefined, {
    ...config,
    allowEmptyData: config?.allowEmptyData ?? true,
  });
}

export async function testConnection(): Promise<boolean> {
  try {
    const baseUrl = await getCurrentBaseUrl();
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();
    return data.success === true && data.data?.status === 'ok';
  } catch {
    return false;
  }
}

export async function getCurrentBackendUrl(): Promise<string> {
  return await getCurrentBaseUrl();
}
