import { useCallback, useMemo, useState } from 'react';

import { getOrCreateDeviceId } from '@/features/auth/device';
import {
  createLocalFolder,
  deleteLocalFolder,
  updateLocalFolder,
} from '@/features/folders/localStore';
import type { FragmentFolder } from '@/types/folder';
import { getErrorMessage } from '@/utils/error';
import { useFolderListQuery } from '@/features/folders/queries';

export interface UseFoldersReturn {
  /** 文件夹列表 */
  folders: FragmentFolder[];
  /** 是否加载中 */
  isLoading: boolean;
  /** 是否刷新中 */
  isRefreshing: boolean;
  /** 是否正在创建文件夹 */
  isCreating: boolean;
  /** 错误信息 */
  error: string | null;
  /** 文件夹总数 */
  total: number;
  /** 全部碎片数量（用于"全部"虚拟文件夹） */
  allFragmentsCount: number;
  /** 全部成稿数量（用于系统"成稿"入口） */
  allScriptsCount: number;
  /** 获取文件夹列表 */
  fetchFolders: () => Promise<void>;
  /** 刷新文件夹列表 */
  refreshFolders: () => Promise<void>;
  /** 创建新文件夹 */
  createNewFolder: (name: string) => Promise<void>;
  /** 重命名文件夹 */
  renameFolder: (id: string, name: string) => Promise<void>;
  /** 删除文件夹 */
  removeFolder: (id: string) => Promise<void>;
}

/**
 * 文件夹列表管理 Hook
 * 同时获取文件夹列表和全部碎片数量（用于"全部"虚拟文件夹）
 */
export function useFolders(): UseFoldersReturn {
  const query = useFolderListQuery();
  const [isCreating, setIsCreating] = useState(false);
  const folders = useMemo(() => query.data?.folders ?? [], [query.data?.folders]);
  const allFragmentsCount = query.data?.allFragmentsCount ?? 0;
  const allScriptsCount = query.data?.allScriptsCount ?? 0;
  const total = folders.length;

  const fetchFolders = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const refreshFolders = useCallback(async () => {
    await query.refetch();
  }, [query]);

  /**
   * 创建新文件夹
   * @param name - 文件夹名称
   */
  const createNewFolder = useCallback(async (name: string) => {
    setIsCreating(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      await createLocalFolder(name, deviceId);
      await query.refetch();
    } catch (err) {
      throw err; // 向上抛出错误以便调用方处理
    } finally {
      setIsCreating(false);
    }
  }, [query]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    try {
      const deviceId = await getOrCreateDeviceId();
      await updateLocalFolder(id, { name }, deviceId);
      await query.refetch();
    } catch (err) {
      throw err;
    }
  }, [query]);

  const removeFolder = useCallback(async (id: string) => {
    try {
      const deviceId = await getOrCreateDeviceId();
      await deleteLocalFolder(id, deviceId);
      await query.refetch();
    } catch (err) {
      throw err;
    }
  }, [query]);

  return {
    folders,
    isLoading: query.isPending,
    isRefreshing: query.isRefetching,
    isCreating,
    error: query.error ? getErrorMessage(query.error, '获取文件夹列表失败') : null,
    total,
    allFragmentsCount,
    allScriptsCount,
    fetchFolders,
    refreshFolders,
    createNewFolder,
    renameFolder,
    removeFolder,
  };
}
