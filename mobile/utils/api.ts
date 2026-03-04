/**
 * API 请求工具模块
 * 统一封装 fetch，自动处理 BASE_URL、Token、错误处理
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, STORAGE_KEYS, API_ENDPOINTS, getBackendUrl, updateApiBaseUrl } from '@/constants/config';

// 统一响应格式
interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  message: string | null;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// 请求配置
interface RequestConfig extends RequestInit {
  headers?: Record<string, string>;
}

/**
 * 获取当前有效的 API_BASE_URL
 * 每次请求前调用以确保使用最新的配置
 */
async function getCurrentBaseUrl(): Promise<string> {
  // 从动态配置获取
  const configuredUrl = await getBackendUrl();
  // 更新全局变量以保持兼容性
  updateApiBaseUrl(configuredUrl);
  return configuredUrl;
}

/**
 * 存储 Token 到 AsyncStorage
 * @param token JWT Token
 */
export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
}

/**
 * 从 AsyncStorage 获取 Token
 */
export async function getToken(): Promise<string | null> {
  return await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
}

/**
 * 清除 Token（登出时使用）
 */
export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
}

/**
 * 自动获取测试用户 Token
 * 如果没有本地 Token，自动调用后端 /api/auth/token 获取
 */
export async function fetchTestToken(): Promise<string> {
  try {
    const baseUrl = await getCurrentBaseUrl();
    const response = await fetch(`${baseUrl}${API_ENDPOINTS.AUTH.TOKEN}`, {
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
    // 检查是否是网络连接错误
    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Network'))) {
      throw new ApiError(
        'NETWORK_ERROR',
        '无法连接到后端服务。\n\n请检查：\n1. 后端服务是否已启动（uvicorn main:app --reload）\n2. 手机和电脑是否在同一 WiFi 网络\n3. 后端地址配置是否正确\n\n当前地址: ' + (await getCurrentBaseUrl())
      );
    }
    throw new ApiError('AUTH_ERROR', '认证请求失败: ' + (error as Error).message);
  }
}

/**
 * 确保有有效的 Token
 * 如果本地没有，自动获取测试用户 Token
 */
async function ensureToken(): Promise<string> {
  let token = await getToken();
  if (!token) {
    token = await fetchTestToken();
  }
  return token;
}

/**
 * 统一 API 请求函数
 * @param endpoint API 端点（如 /api/fragments）
 * @param method HTTP 方法
 * @param body 请求体
 * @param config 额外配置
 */
export async function fetchApi<T = any>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: any,
  config: RequestConfig = {}
): Promise<T> {
  const baseUrl = await getCurrentBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };

  // 自动添加 Token（如果需要认证）
  if (config.headers?.Authorization !== undefined) {
    // 如果调用者显式传入了 Authorization，则使用传入的（包括空字符串表示不需要认证）
    if (config.headers.Authorization) {
      headers['Authorization'] = config.headers.Authorization;
    }
  } else {
    // 默认自动获取并添加 Token
    const token = await ensureToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 构建请求配置
  const requestConfig: RequestInit = {
    method,
    headers,
    ...config,
  };

  // 添加请求体
  if (body) {
    requestConfig.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    console.log(`[API] ${method} ${url}`);
    const response = await fetch(url, requestConfig);
    console.log(`[API] 响应状态: ${response.status}`);

    // 处理 401 未授权错误 - Token 可能过期，尝试重新获取
    if (response.status === 401) {
      console.log('[API] 收到 401，尝试重新获取 Token');
      await clearToken();
      const newToken = await fetchTestToken();
      headers['Authorization'] = `Bearer ${newToken}`;

      // 重试请求
      const retryResponse = await fetch(url, {
        ...requestConfig,
        headers,
      });

      // 重试后如果是 204 No Content，直接返回
      if (retryResponse.status === 204) {
        return {} as T;
      }

      const retryData: ApiResponse<T> = await retryResponse.json();
      if (!retryData.success) {
        throw new ApiError(
          retryData.error?.code || 'UNKNOWN_ERROR',
          retryData.error?.message || '请求失败',
          retryData.error?.details
        );
      }
      if (retryData.data === null) {
        throw new ApiError('NO_DATA', '响应数据为空');
      }
      return retryData.data;
    }

    // 处理 204 No Content（DELETE 请求成功）
    if (response.status === 204) {
      console.log('[API] 收到 204 No Content，返回空对象');
      return {} as T;
    }

    // 解析响应
    const data: ApiResponse<T> = await response.json();

    // 检查业务错误
    if (!data.success) {
      throw new ApiError(
        data.error?.code || 'UNKNOWN_ERROR',
        data.error?.message || '请求失败',
        data.error?.details
      );
    }

    // 返回数据
    if (data.data === null) {
      throw new ApiError('NO_DATA', '响应数据为空');
    }

    return data.data;
  } catch (error) {
    // 网络错误或解析错误
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

/**
 * API 错误类
 */
export class ApiError extends Error {
  code: string;
  details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/**
 * 便捷方法：GET 请求
 */
export function get<T = any>(endpoint: string, config?: RequestConfig): Promise<T> {
  return fetchApi<T>(endpoint, 'GET', undefined, config);
}

/**
 * 便捷方法：POST 请求
 */
export function post<T = any>(
  endpoint: string,
  body?: any,
  config?: RequestConfig
): Promise<T> {
  return fetchApi<T>(endpoint, 'POST', body, config);
}

/**
 * 便捷方法：PUT 请求
 */
export function put<T = any>(
  endpoint: string,
  body?: any,
  config?: RequestConfig
): Promise<T> {
  return fetchApi<T>(endpoint, 'PUT', body, config);
}

/**
 * 便捷方法：PATCH 请求
 */
export function patch<T = any>(
  endpoint: string,
  body?: any,
  config?: RequestConfig
): Promise<T> {
  return fetchApi<T>(endpoint, 'PATCH', body, config);
}

/**
 * 便捷方法：DELETE 请求
 */
export function del<T = any>(endpoint: string, config?: RequestConfig): Promise<T> {
  return fetchApi<T>(endpoint, 'DELETE', undefined, config);
}

/**
 * 测试连通性
 */
export async function testConnection(): Promise<boolean> {
  try {
    const baseUrl = await getCurrentBaseUrl();
    const response = await fetch(`${baseUrl}/`);
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * 获取当前配置的后端地址（用于显示）
 */
export async function getCurrentBackendUrl(): Promise<string> {
  return await getCurrentBaseUrl();
}
