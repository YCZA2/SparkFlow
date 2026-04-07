import { useCallback, useState } from 'react';

import { getOrCreateDeviceId } from '@/features/auth/device';
import {
  createLocalFolder,
  deleteLocalFolder,
  listLocalFolders,
  updateLocalFolder,
} from '@/features/folders/localStore';
import { listLocalFragmentEntities } from '@/features/fragments/store';
import { countLocalScriptEntities } from '@/features/scripts/store';
import type { FragmentFolder } from '@/types/folder';
import { getErrorMessage } from '@/utils/error';

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

async function fetchFoldersData(): Promise<{
  folders: FragmentFolder[];
  allFragmentsCount: number;
  allScriptsCount: number;
}> {
  /*并发查询文件夹列表、碎片数量和成稿数量，供 fetchFolders/refreshFolders 共用。 */
  const [localFolders, localFragments, localScriptsCount] = await Promise.all([
    listLocalFolders(),
    listLocalFragmentEntities(),
    countLocalScriptEntities(),
  ]);
  return {
    folders: localFolders,
    allFragmentsCount: localFragments.length,
    allScriptsCount: localScriptsCount,
  };
}

/**
 * 文件夹列表管理 Hook
 * 同时获取文件夹列表和全部碎片数量（用于"全部"虚拟文件夹）
 */
export function useFolders(): UseFoldersReturn {
  const [folders, setFolders] = useState<FragmentFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [allFragmentsCount, setAllFragmentsCount] = useState(0);
  const [allScriptsCount, setAllScriptsCount] = useState(0);

  const applyFoldersData = useCallback(
    (data: { folders: FragmentFolder[]; allFragmentsCount: number; allScriptsCount: number }) => {
      /*将查询结果统一写入 state，避免 fetch/refresh 两条路径各自维护。 */
      setFolders(data.folders);
      setTotal(data.folders.length);
      setAllFragmentsCount(data.allFragmentsCount);
      setAllScriptsCount(data.allScriptsCount);
    },
    []
  );

  const fetchFolders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      applyFoldersData(await fetchFoldersData());
    } catch (err) {
      setError(getErrorMessage(err, '获取文件夹列表失败'));
    } finally {
      setIsLoading(false);
    }
  }, [applyFoldersData]);

  const refreshFolders = useCallback(async () => {
    setIsRefreshing(true);
    try {
      applyFoldersData(await fetchFoldersData());
    } catch (err) {
      setError(getErrorMessage(err, '刷新文件夹列表失败'));
    } finally {
      setIsRefreshing(false);
    }
  }, [applyFoldersData]);

  /**
   * 创建新文件夹
   * @param name - 文件夹名称
   */
  const createNewFolder = useCallback(async (name: string) => {
    setIsCreating(true);
    setError(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const newFolder = await createLocalFolder(name, deviceId);
      setFolders((prev) => [newFolder, ...prev]);
      setTotal((prev) => prev + 1);
    } catch (err) {
      const errorMessage = getErrorMessage(err, '创建文件夹失败');
      setError(errorMessage);
      throw err; // 向上抛出错误以便调用方处理
    } finally {
      setIsCreating(false);
    }
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    try {
      const deviceId = await getOrCreateDeviceId();
      const updated = await updateLocalFolder(id, { name }, deviceId);
      if (updated) {
        setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)));
      }
    } catch (err) {
      setError(getErrorMessage(err, '重命名文件夹失败'));
      throw err;
    }
  }, []);

  const removeFolder = useCallback(async (id: string) => {
    try {
      const deviceId = await getOrCreateDeviceId();
      await deleteLocalFolder(id, deviceId);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) {
      setError(getErrorMessage(err, '删除文件夹失败'));
      throw err;
    }
  }, []);

  return {
    folders,
    isLoading,
    isRefreshing,
    isCreating,
    error,
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
