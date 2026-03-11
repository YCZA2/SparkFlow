import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchFragments } from '@/features/fragments/api';
import { consumeFragmentsStale } from '@/features/fragments/refreshSignal';
import { useFragmentSelection } from '@/features/fragments/hooks';
import type { Fragment } from '@/types/fragment';

export interface FragmentSection {
  title: string;
  data: Fragment[];
}

function getSectionLabel(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '更早';

  const today = new Date();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((current.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function buildSections(fragments: Fragment[]): FragmentSection[] {
  const sectionMap = new Map<string, Fragment[]>();

  for (const fragment of fragments) {
    const key = getSectionLabel(fragment.created_at);
    const current = sectionMap.get(key) ?? [];
    current.push(fragment);
    sectionMap.set(key, current);
  }

  return Array.from(sectionMap.entries()).map(([title, data]) => ({ title, data }));
}

export interface UseFolderFragmentsReturn {
  /** 碎片列表 */
  fragments: Fragment[];
  /** 分组后的碎片 */
  sections: FragmentSection[];
  /** 是否加载中 */
  isLoading: boolean;
  /** 是否刷新中 */
  isRefreshing: boolean;
  /** 错误信息 */
  error: string | null;
  /** 碎片总数 */
  total: number;
  /** 总数标签 */
  totalLabel: string;
  /** 获取碎片列表 */
  fetchFragments: () => Promise<void>;
  /** 刷新碎片列表 */
  refreshFragments: () => Promise<void>;
  /** 选择相关 */
  selection: ReturnType<typeof useFragmentSelection>;
}

/**
 * 文件夹内碎片管理 Hook
 */
export function useFolderFragments(folderId: string): UseFolderFragmentsReturn {
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selection = useFragmentSelection(20);

  const sections = useMemo(() => buildSections(fragments), [fragments]);

  const loadFragments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 当 folderId 为 '__all__' 时，不传 folderId 获取全部碎片
      const response = await fetchFragments(folderId === '__all__' ? undefined : folderId);
      setFragments(response.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取碎片列表失败');
    } finally {
      setIsLoading(false);
    }
  }, [folderId]);

  const refreshFragments = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 当 folderId 为 '__all__' 时，不传 folderId 获取全部碎片
      const response = await fetchFragments(folderId === '__all__' ? undefined : folderId);
      setFragments(response.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新碎片列表失败');
    } finally {
      setIsRefreshing(false);
    }
  }, [folderId]);

  useEffect(() => {
    void loadFragments();
  }, [loadFragments]);

  useFocusEffect(
    useCallback(() => {
      if (consumeFragmentsStale()) {
        void refreshFragments();
      }
    }, [refreshFragments])
  );

  return {
    fragments,
    sections,
    isLoading,
    isRefreshing,
    error,
    total: fragments.length,
    totalLabel: `${fragments.length} 条灵感`,
    fetchFragments: loadFragments,
    refreshFragments,
    selection,
  };
}
