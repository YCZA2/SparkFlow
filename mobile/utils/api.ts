/**
 * API 请求工具模块
 * 统一封装 fetch，自动处理 BASE_URL、Token、错误处理
 */

// 后端地址配置
// 模拟器使用 localhost，真机使用局域网 IP
const BASE_URL = 'http://localhost:8000';

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
 * 获取存储的 Token（预留，后续接入 AsyncStorage）
 */
async function getToken(): Promise<string | null> {
  // TODO: 阶段 4 接入 AsyncStorage
  // return await AsyncStorage.getItem('token');
  return null;
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
  const url = `${BASE_URL}${endpoint}`;

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };

  // 自动添加 Token
  const token = await getToken();
  if (token) {
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
    const response = await fetch(url, requestConfig);

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

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError(
        'NETWORK_ERROR',
        '网络连接失败，请检查后端服务是否启动'
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
    const response = await fetch(`${BASE_URL}/`);
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}
