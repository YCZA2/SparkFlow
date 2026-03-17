import { useCallback, useState } from 'react';

import * as folderApi from '@/features/folders/api';
import { getOrCreateDeviceId } from '@/features/auth/device';
import { createLocalFolder, listLocalFolders } from '@/features/folders/localStore';
import { listLocalFragmentEntities } from '@/features/fragments/store/localEntityStore';
import { countLocalScriptEntities } from '@/features/scripts/store';
import { syncRemoteScriptsToLocal } from '@/features/scripts/sync';
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
  /** 全部成稿数量（用于系统“成稿”入口） */
  allScriptsCount: number;
  /** 获取文件夹列表 */
  fetchFolders: () => Promise<void>;
  /** 刷新文件夹列表 */
  refreshFolders: () => Promise<void>;
  /** 创建新文件夹 */
  createNewFolder: (name: string) => Promise<void>;
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

  const fetchFolders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      try {
        await syncRemoteScriptsToLocal();
      } catch {
        // 首页文件夹不应因为成稿同步失败而整体报错，仍优先展示本地内容。
      }
      const [localFolders, localFragments, localScriptsCount] = await Promise.all([
        listLocalFolders(),
        listLocalFragmentEntities(),
        countLocalScriptEntities(),
      ]);
      setFolders(localFolders);
      setTotal(localFolders.length);
      setAllFragmentsCount(localFragments.length);
      setAllScriptsCount(localScriptsCount);
    } catch (err) {
      setError(getErrorMessage(err, '获取文件夹列表失败'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshFolders = useCallback(async () => {
    setIsRefreshing(true);
    try {
      try {
        await syncRemoteScriptsToLocal();
      } catch {
        // 刷新时允许成稿同步失败后继续展示本地文件夹结果。
      }
      const [localFolders, localFragments, localScriptsCount] = await Promise.all([
        listLocalFolders(),
        listLocalFragmentEntities(),
        countLocalScriptEntities(),
      ]);
      setFolders(localFolders);
      setTotal(localFolders.length);
      setAllFragmentsCount(localFragments.length);
      setAllScriptsCount(localScriptsCount);
    } catch (err) {
      setError(getErrorMessage(err, '刷新文件夹列表失败'));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

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
  };
}
