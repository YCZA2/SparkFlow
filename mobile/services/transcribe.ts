/**
 * 语音转写服务模块
 * 提供音频上传、转写状态查询等功能
 */

import { API_ENDPOINTS } from '@/constants/config';
import {
  fetchApi,
  getCurrentBackendUrl,
  clearToken,
  fetchTestToken,
  ApiError,
} from './client';

/**
 * 上传音频文件
 * 专门用于上传录音文件到后端，支持 multipart/form-data
 *
 * @param uri 本地音频文件 URI
 * @returns 上传结果，包含 fragment_id、audio_path 等信息
 *
 * @example
 * ```typescript
 * const result = await uploadAudio('file:///path/to/recording.m4a');
 * console.log(result.fragment_id); // 碎片记录 ID
 * ```
 */
export async function uploadAudio<T = UploadAudioResponse>(uri: string): Promise<T> {
  const baseUrl = await getCurrentBackendUrl();
  const url = `${baseUrl}${API_ENDPOINTS.TRANSCRIBE}/`;

  // 从 URI 提取文件名
  const filename = uri.split('/').pop() || 'recording.m4a';

  // 创建 FormData
  const formData = new FormData();
  formData.append('audio', {
    uri,
    name: filename,
    type: 'audio/m4a',
  } as any);

  console.log(`[Transcribe] 上传音频: ${url}`);
  console.log(`[Transcribe] 文件: ${uri}`);

  try {
    // 获取 Token
    const token = await fetchTestToken();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });

    console.log(`[Transcribe] 上传响应状态: ${response.status}`);

    // 处理 401 未授权错误
    if (response.status === 401) {
      console.log('[Transcribe] 收到 401，尝试重新获取 Token');
      await clearToken();
      const newToken = await fetchTestToken();

      const retryResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${newToken}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      const retryData = await retryResponse.json();
      if (!retryData.success) {
        throw new ApiError(
          retryData.error?.code || 'UPLOAD_FAILED',
          retryData.error?.message || '上传失败'
        );
      }
      if (retryData.data === null) {
        throw new ApiError('NO_DATA', '响应数据为空');
      }
      return retryData.data;
    }

    // 解析响应
    const data = await response.json();

    // 检查业务错误
    if (!data.success) {
      throw new ApiError(
        data.error?.code || 'UPLOAD_FAILED',
        data.error?.message || '上传失败',
        data.error?.details
      );
    }

    if (data.data === null) {
      throw new ApiError('NO_DATA', '响应数据为空');
    }

    return data.data;
  } catch (error) {
    // 网络错误处理
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Network'))) {
      throw new ApiError(
        'NETWORK_ERROR',
        '网络连接失败，请检查网络后重试'
      );
    }

    throw new ApiError('UPLOAD_ERROR', '上传音频失败: ' + (error as Error).message);
  }
}

/**
 * 上传音频响应数据类型
 */
export interface UploadAudioResponse {
  /** 碎片记录 ID */
  fragment_id: string;
  /** 音频文件绝对路径 */
  audio_path: string;
  /** 音频文件相对路径 */
  relative_path: string;
  /** 文件大小（字节） */
  file_size: number;
  /** 状态消息 */
  message: string;
}

/**
 * 获取转写状态
 * 查询指定碎片笔记的语音转写状态和结果
 *
 * @param fragmentId 碎片笔记 ID
 * @returns 转写状态信息
 */
export async function getTranscribeStatus(fragmentId: string) {
  return fetchApi<TranscribeStatusResponse>(
    `${API_ENDPOINTS.TRANSCRIBE}/status/${fragmentId}`
  );
}

/**
 * 转写状态响应数据类型
 */
export interface TranscribeStatusResponse {
  /** 碎片记录 ID */
  fragment_id: string;
  /** 同步状态：pending/syncing/synced/failed */
  sync_status: string;
  /** 转写文本（如果有） */
  transcript: string | null;
  /** AI 摘要（如果有） */
  summary: string | null;
  /** 标签列表（如果有） */
  tags: string[] | null;
  /** 音频文件路径 */
  audio_path: string | null;
  /** 创建时间 */
  created_at: string;
}
