/**
 * 碎片列表数据管理 Hook
 * 提供碎片列表的获取、刷新等功能
 */

import { useState, useEffect, useCallback } from 'react';
import { get, del, ApiError } from '@/utils/api';
import { API_ENDPOINTS } from '@/constants/config';
import type { Fragment, FragmentListResponse } from '@/types/fragment';

// Hook 返回状态类型
interface UseFragmentsState {
  /** 碎片列表 */
  fragments: Fragment[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否正在刷新（下拉刷新） */
  isRefreshing: boolean;
  /** 错误信息 */
  error: string | null;
  /** 总数 */
  total: number;
}

/**
 * 碎片列表管理 Hook
 * @returns 碎片列表状态和相关操作
 */
export function useFragments() {
  const [state, setState] = useState<UseFragmentsState>({
    fragments: [],
    isLoading: true,
    isRefreshing: false,
    error: null,
    total: 0,
  });

  /**
   * 获取碎片列表
   * @param isRefresh 是否为刷新操作
   */
  const fetchFragments = useCallback(async (isRefresh = false) => {
    try {
      setState((prev) => ({
        ...prev,
        isLoading: !isRefresh,
        isRefreshing: isRefresh,
        error: null,
      }));

      const data = await get<FragmentListResponse>(API_ENDPOINTS.FRAGMENTS.LIST);

      setState({
        fragments: data.items || [],
        isLoading: false,
        isRefreshing: false,
        error: null,
        total: data.total || 0,
      });
    } catch (error) {
      // 使用 setTimeout 避免新架构事件冲突
      await new Promise(resolve => setTimeout(resolve, 0));

      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : '获取碎片列表失败';

      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: message,
      }));
    }
  }, []);

  /**
   * 刷新碎片列表（用于下拉刷新）
   */
  const refreshFragments = useCallback(async () => {
    await fetchFragments(true);
  }, [fetchFragments]);

  /**
   * 组件挂载时自动获取数据
   */
  useEffect(() => {
    // 添加小延迟避免与 useAuth 初始化冲突
    const timer = setTimeout(() => {
      fetchFragments();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchFragments]);

  return {
    ...state,
    fetchFragments,
    refreshFragments,
  };
}

/**
 * 获取单条碎片详情
 * @param id 碎片ID
 * @returns 碎片详情
 */
export async function fetchFragmentDetail(id: string): Promise<Fragment> {
  return await get<Fragment>(API_ENDPOINTS.FRAGMENTS.DETAIL(id));
}

/**
 * 删除碎片
 * @param id 碎片ID
 */
export async function deleteFragment(id: string): Promise<void> {
  console.log('deleteFragment 被调用，ID:', id);
  try {
    await del<void>(API_ENDPOINTS.FRAGMENTS.DETAIL(id));
    console.log('deleteFragment API 调用成功');
  } catch (err) {
    console.error('deleteFragment API 调用失败:', err);
    throw err;
  }
}

