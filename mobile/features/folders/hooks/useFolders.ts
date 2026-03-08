import { useCallback, useState } from 'react';

import * as folderApi from '@/features/folders/api';
import { fetchFragments } from '@/features/fragments/api';
import type { FragmentFolder } from '@/types/folder';

export interface UseFoldersReturn {
  /** 文件夹列表 */
  folders: FragmentFolder[];
  /** 是否加载中 */
  isLoading: boolean;
  /** 是否刷新中 */
  isRefreshing: boolean;
  /** 错误信息 */
  error: string | null;
  /** 文件夹总数 */
  total: number;
  /** 全部碎片数量（用于"全部"虚拟文件夹） */
  allFragmentsCount: number;
  /** 获取文件夹列表 */
  fetchFolders: () => Promise<void>;
  /** 刷新文件夹列表 */
  refreshFolders: () => Promise<void>;
}

/**
 * 文件夹列表管理 Hook
 * 同时获取文件夹列表和全部碎片数量（用于"全部"虚拟文件夹）
 */
export function useFolders(): UseFoldersReturn {
  const [folders, setFolders] = useState<FragmentFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [allFragmentsCount, setAllFragmentsCount] = useState(0);

  const fetchFolders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 同时获取文件夹列表和全部碎片数量
      const [foldersResponse, fragmentsResponse] = await Promise.all([
        folderApi.fetchFolders(),
        fetchFragments(), // 不传 folderId 获取全部碎片
      ]);
      setFolders(foldersResponse.items);
      setTotal(foldersResponse.total);
      setAllFragmentsCount(fragmentsResponse.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取文件夹列表失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshFolders = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [foldersResponse, fragmentsResponse] = await Promise.all([
        folderApi.fetchFolders(),
        fetchFragments(),
      ]);
      setFolders(foldersResponse.items);
      setTotal(foldersResponse.total);
      setAllFragmentsCount(fragmentsResponse.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新文件夹列表失败');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return {
    folders,
    isLoading,
    isRefreshing,
    error,
    total,
    allFragmentsCount,
    fetchFolders,
    refreshFolders,
  };
}
