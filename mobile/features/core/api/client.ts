import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS, getBackendUrl } from '@/constants/config';
import { createDebugLogEntry, emitDebugLog, serializeForLog } from '@/features/debug-log/store';

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
  await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
}

export async function getToken(): Promise<string | null> {
  return await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
}

export async function fetchTestToken(): Promise<string> {
  try {
    const baseUrl = await getCurrentBaseUrl();
    const response = await fetch(`${baseUrl}/api/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data: ApiResponse<{ access_token: string; token_type: string }> = await response.json();
    if (!data.success || !data.data?.access_token) {
      throw new ApiError('AUTH_FAILED', '获取测试用户 Token 失败');
    }

    const token = data.data.access_token;
    await setToken(token);
    return token;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Network'))) {
      throw new ApiError(
        'NETWORK_ERROR',
        '无法连接到后端服务。\n\n请检查：\n1. 后端服务是否已启动（uvicorn main:app --reload）\n2. 手机和电脑是否在同一 WiFi 网络\n3. 后端地址配置是否正确\n\n当前地址: ' + (await getCurrentBaseUrl())
      );
    }
    throw new ApiError('AUTH_ERROR', '认证请求失败: ' + (error as Error).message);
  }
}

async function ensureToken(): Promise<string> {
  let token = await getToken();
  if (!token) {
    token = await fetchTestToken();
  }
  return token;
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
      console.log('[API] 收到 401，尝试重新获取 Token');
      await clearToken();
      const newToken = await fetchTestToken();
      const retryConfig = await buildRequest(newToken);
      const retryResponse = await fetch(url, retryConfig);
      return await parseApiResponse<T>(retryResponse, requestConfig as RequestConfig);
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
