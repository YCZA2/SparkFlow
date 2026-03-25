import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { buildFragmentSections, type FragmentSection } from '@/features/fragments/fragmentListState';
import { useFragmentSelection } from '@/features/fragments/hooks';
import { useFragments } from '@/features/fragments/hooks/useFragments';
import { useSingleFlightRouterPush } from '@/hooks/useSingleFlightRouterPush';
import type { Fragment } from '@/types/fragment';

interface UseFragmentListScreenStateOptions {
  folderId?: string | null;
  folderName?: string | null;
  enableRefreshParam?: boolean;
}

export interface FragmentListScreenState {
  fragments: Fragment[];
  sections: FragmentSection[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  total: number;
  totalLabel: string;
  selection: ReturnType<typeof useFragmentSelection>;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  onFragmentPress: (fragment: Fragment) => void;
  onGenerate: () => Promise<void>;
}

export function useFragmentListScreenState({
  folderId,
  folderName,
  enableRefreshParam = false,
}: UseFragmentListScreenStateOptions = {}): FragmentListScreenState {
  /*统一首页与文件夹页的碎片列表 view-model，避免页面各写一套选择与跳转逻辑。 */
  const router = useRouter();
  const pushOnce = useSingleFlightRouterPush();
  const params = useLocalSearchParams<{ refresh?: string }>();
  const { fragments, isLoading, isRefreshing, error, refreshFragments, fetchFragments } =
    useFragments({ folderId });
  const selection = useFragmentSelection(20);

  const sections = useMemo(() => buildFragmentSections(fragments), [fragments]);

  useFocusEffect(
    useCallback(() => {
      if (!enableRefreshParam || params.refresh !== 'true') return;
      void fetchFragments();
      router.setParams({ refresh: undefined });
    }, [enableRefreshParam, fetchFragments, params.refresh, router])
  );

  const onFragmentPress = useCallback(
    (fragment: Fragment) => {
      if (selection.isSelectionMode) {
        // 所有碎片都可以被选择，无论同步状态
        const accepted = selection.toggleSelect(fragment.id);
        if (!accepted) {
          Alert.alert('已达上限', `最多选择 ${selection.maxSelection} 条碎片`);
        }
        return;
      }

      /*非选择态下通过导航去重保护详情跳转，避免快速连点重复打开同一正文页。 */
      pushOnce(
        {
          pathname: '/fragment/[id]' as const,
          params: { id: fragment.id, ...(folderId ? { folderId, folderName: folderName || '' } : {}) },
        },
        `fragment:${fragment.id}`
      );
    },
    [pushOnce, selection, folderId, folderName]
  );

  const onGenerate = useCallback(async () => {
    if (selection.selectedCount === 0) {
      Alert.alert('请选择碎片', '请至少选择 1 条碎片');
      return;
    }

    // 使用 Set 优化查找性能
    const selectedIdSet = new Set(selection.selectedIds);
    const selectedFragments = fragments.filter((item) => selectedIdSet.has(item.id));

    const fragmentIds = selectedFragments.map((item) => item.id).filter(Boolean);

    if (fragmentIds.length === 0) {
      Alert.alert('准备失败', '无法获取碎片 ID，请重试');
      return;
    }

    router.push({
      pathname: '/generate',
      params: { fragmentIds: fragmentIds.join(',') },
    });
  }, [fragments, router, selection.selectedCount, selection.selectedIds]);

  return {
    fragments,
    sections,
    isLoading,
    isRefreshing,
    error,
    total: fragments.length,
    totalLabel: `${fragments.length} 条灵感`,
    selection,
    refresh: refreshFragments,
    reload: fetchFragments,
    onFragmentPress,
    onGenerate,
  };
}
