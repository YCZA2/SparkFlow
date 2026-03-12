import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { buildFragmentSections, type FragmentSection } from '@/features/fragments/fragmentListState';
import { useFragmentSelection } from '@/features/fragments/hooks';
import { useFragments } from '@/features/fragments/hooks/useFragments';
import { prewarmRemoteFragmentSnapshot } from '@/features/fragments/store';
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
  onGenerate: () => void;
}

export function useFragmentListScreenState({
  folderId,
  folderName,
  enableRefreshParam = false,
}: UseFragmentListScreenStateOptions = {}): FragmentListScreenState {
  /*统一首页与文件夹页的碎片列表 view-model，避免页面各写一套选择与跳转逻辑。 */
  const router = useRouter();
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
        if (fragment.is_local_draft && !fragment.remote_id) {
          Alert.alert('暂不可选择', '本地草稿尚未同步完成，暂时不能用于 AI 编导。');
          return;
        }
        const accepted = selection.toggleSelect(fragment.id);
        if (!accepted) {
          Alert.alert('已达上限', `最多选择 ${selection.maxSelection} 条碎片`);
        }
        return;
      }

      if (!fragment.is_local_draft) {
        void prewarmRemoteFragmentSnapshot(fragment);
      }
      // 跳转到详情页时，传递来源文件夹ID和名称（如果有）
      router.push({
        pathname: `/fragment/${fragment.id}`,
        params: folderId ? { folderId, folderName: folderName || '' } : {},
      });
    },
    [router, selection, folderId, folderName]
  );

  const onGenerate = useCallback(() => {
    if (selection.selectedCount === 0) {
      Alert.alert('请选择碎片', '请至少选择 1 条碎片');
      return;
    }

    const selectedRemoteIds = selection.selectedIds
      .map((selectedId) => fragments.find((item) => item.id === selectedId) ?? null)
      .map((item) => item?.remote_id ?? item?.id ?? null)
      .filter((item): item is string => Boolean(item));

    if (selectedRemoteIds.length !== selection.selectedCount) {
      Alert.alert('请稍后重试', '仍有本地草稿未完成同步，暂时不能进入 AI 编导。');
      return;
    }

    router.push({
      pathname: '/generate',
      params: { fragmentIds: selectedRemoteIds.join(',') },
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
