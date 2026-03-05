/**
 * API 服务层统一导出
 * 按领域拆分的服务模块，替代原来的 utils/api.ts
 *
 * @example
 * ```typescript
 * // 推荐新用法：从具体模块导入
 * import { uploadAudio } from '@/services/transcribe';
 * import { fetchFragments } from '@/services/fragments';
 *
 * // 兼容用法：统一导入
 * import { uploadAudio, fetchFragments, ApiError } from '@/services';
 * ```
 */

// 基础客户端（HTTP 请求、错误处理、Token 管理）
export {
  // 核心请求方法
  fetchApi,
  get,
  post,
  put,
  patch,
  del,
  // 错误类
  ApiError,
  // Token 管理
  getToken,
  setToken,
  clearToken,
  fetchTestToken,
  // 工具
  testConnection,
  getCurrentBackendUrl,
} from './client';

// 语音转写服务
export {
  uploadAudio,
  getTranscribeStatus,
  type UploadAudioResponse,
  type TranscribeStatusResponse,
} from './transcribe';

// 碎片笔记服务
export {
  fetchFragments,
  fetchFragmentDetail,
  deleteFragment,
  createFragment,
  updateFragment,
  type CreateFragmentRequest,
  type UpdateFragmentRequest,
} from './fragments';

// 口播稿服务
export {
  generateScript,
  fetchScripts,
  fetchScriptDetail,
} from './scripts';

// 认证服务
export {
  loginWithTestUser,
  logout,
  parseUserFromToken,
  saveUserInfo,
  getUserInfo,
  clearUserInfo,
  type UserInfo,
} from './auth';
