import { API_ENDPOINTS } from '@/constants/config';
import { del, get, patch, post } from '@/features/core/api/client';
import type {
  CreateFolderRequest,
  FragmentFolder,
  FragmentFolderListResponse,
  UpdateFolderRequest,
} from '@/types/folder';

/**
 * 获取文件夹列表
 */
export async function fetchFolders(): Promise<FragmentFolderListResponse> {
  return get<FragmentFolderListResponse>(API_ENDPOINTS.FOLDERS.LIST);
}

/**
 * 创建文件夹
 */
export async function createFolder(data: CreateFolderRequest): Promise<FragmentFolder> {
  return post<FragmentFolder>(API_ENDPOINTS.FOLDERS.LIST, data);
}

/**
 * 更新文件夹（重命名）
 */
export async function updateFolder(id: string, data: UpdateFolderRequest): Promise<FragmentFolder> {
  return patch<FragmentFolder>(API_ENDPOINTS.FOLDERS.DETAIL(id), data);
}

/**
 * 删除文件夹
 */
export async function deleteFolder(id: string): Promise<void> {
  await del<void>(API_ENDPOINTS.FOLDERS.DETAIL(id));
}
