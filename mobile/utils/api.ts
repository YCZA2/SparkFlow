/**
 * API 请求工具模块（兼容层）
 *
 * ⚠️ 注意：此文件已废弃，请使用新的服务层导入方式
 *
 * @deprecated 请使用 @/services 替代
 * @example
 * // 新用法（推荐）
 * import { uploadAudio } from '@/services/transcribe';
 * import { fetchFragments, deleteFragment } from '@/services/fragments';
 * import { ApiError } from '@/services/client';
 *
 * // 旧用法（兼容，但不推荐）
 * import { uploadAudio, fetchFragments, ApiError } from '@/utils/api';
 */

// 从新的服务层统一导出，保持向后兼容
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
  // 工具函数
  testConnection,
  getCurrentBackendUrl,
  // 转写服务
  uploadAudio,
  getTranscribeStatus,
  // 碎片服务
  fetchFragments,
  fetchFragmentDetail,
  deleteFragment,
  createFragment,
  updateFragment,
  // 认证服务
  loginWithTestUser,
  logout,
  parseUserFromToken,
  saveUserInfo,
  getUserInfo,
  clearUserInfo,
} from '@/services';

// 导出类型（保持兼容）
export type {
  UploadAudioResponse,
  TranscribeStatusResponse,
  CreateFragmentRequest,
  UpdateFragmentRequest,
  UserInfo,
} from '@/services';
