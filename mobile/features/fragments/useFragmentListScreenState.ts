import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { buildFragmentSections, type FragmentSection } from '@/features/fragments/fragmentListState';
import { useFragmentSelection } from '@/features/fragments/hooks';
import { useFragments } from '@/features/fragments/hooks/useFragments';
import { prewarmRemoteFragmentSnapshot } from '@/features/fragments/store';
import { syncFragmentAndWait } from '@/features/fragments/localFragmentSyncQueue';
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

      // 预加热远程碎片快照
      if (fragment.server_id) {
        void prewarmRemoteFragmentSnapshot(fragment);
      }
      // 跳转到详情页时，传递来源文件夹ID和名称（如果有）
      router.push({
        pathname: '/fragment/[id]' as const,
        params: { id: fragment.id, ...(folderId ? { folderId, folderName: folderName || '' } : {}) },
      });
    },
    [router, selection, folderId, folderName]
  );

  const onGenerate = useCallback(async () => {
    if (selection.selectedCount === 0) {
      Alert.alert('请选择碎片', '请至少选择 1 条碎片');
      return;
    }

    const selectedFragments = selection.selectedIds
      .map((selectedId) => fragments.find((item) => item.id === selectedId) ?? null)
      .filter((item): item is Fragment => Boolean(item));

    // 检查是否有未同步的碎片
    const unsyncedFragments = selectedFragments.filter(
      (item) => item.sync_status !== 'synced'
    );

    // 强制同步未同步的碎片
    if (unsyncedFragments.length > 0) {
      Alert.alert('正在准备...', '正在同步选中的碎片，请稍候');
      try {
        await Promise.all(
          unsyncedFragments.map((f) => syncFragmentAndWait(f.id))
        );
      } catch (error) {
        Alert.alert('同步失败', '部分碎片同步失败，请检查网络后重试');
        return;
      }
    }

    // 使用 server_id（已同步）或 id（本地草稿已同步后会获得 server_id）
    // 注意：同步完成后，本地草稿应该已经有 server_id 了
    const serverIds = selectedFragments
      .map((item) => item.server_id)
      .filter((id): id is string => Boolean(id));

    if (serverIds.length === 0) {
      Alert.alert('同步失败', '无法获取碎片 ID，请重试');
      return;
    }

    router.push({
      pathname: '/generate',
      params: { fragmentIds: serverIds.join(',') },
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
