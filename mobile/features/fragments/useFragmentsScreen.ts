import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { useFragmentSelection } from '@/features/fragments/hooks';
import { useFragments } from '@/features/fragments/hooks/useFragments';
import type { Fragment } from '@/types/fragment';

export interface FragmentSection {
  title: string;
  data: Fragment[];
}

export interface FragmentsScreenState {
  fragments: Fragment[];
  sections: FragmentSection[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  totalLabel: string;
  selection: ReturnType<typeof useFragmentSelection>;
  openCloud: () => void;
  openRecorder: () => void;
  openTextNote: () => void;
  openKnowledgePlaceholder: () => void;
  openNetworkSettings: () => void;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  onFragmentPress: (fragment: Fragment) => void;
  onGenerate: () => void;
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

export function useFragmentsScreen(): FragmentsScreenState {
  const router = useRouter();
  const params = useLocalSearchParams<{ refresh?: string }>();
  const { fragments, isLoading, isRefreshing, error, refreshFragments, fetchFragments } =
    useFragments();
  const selection = useFragmentSelection(20);

  const sections = useMemo(() => buildSections(fragments), [fragments]);

  useFocusEffect(
    useCallback(() => {
      if (params.refresh === 'true') {
        void fetchFragments();
        router.setParams({ refresh: undefined });
      }
    }, [fetchFragments, params.refresh, router])
  );

  const onFragmentPress = useCallback(
    (fragment: Fragment) => {
      if (selection.isSelectionMode) {
        const accepted = selection.toggleSelect(fragment.id);
        if (!accepted) {
          Alert.alert('已达上限', `最多选择 ${selection.maxSelection} 条碎片`);
        }
        return;
      }

      router.push(`/fragment/${fragment.id}`);
    },
    [router, selection]
  );

  const onGenerate = useCallback(() => {
    if (selection.selectedCount === 0) {
      Alert.alert('请选择碎片', '请至少选择 1 条碎片');
      return;
    }

    router.push({
      pathname: '/generate',
      params: { fragmentIds: selection.selectedIds.join(',') },
    });
  }, [router, selection.selectedCount, selection.selectedIds]);

  return {
    fragments,
    sections,
    isLoading,
    isRefreshing,
    error,
    totalLabel: `${fragments.length} 条灵感`,
    selection,
    openCloud: () => router.push('/fragment-cloud'),
    openRecorder: () => router.push('/record-audio'),
    openTextNote: () => router.push('/text-note'),
    openKnowledgePlaceholder: () => router.push('/knowledge'),
    openNetworkSettings: () => router.push('/network-settings'),
    refresh: refreshFragments,
    reload: fetchFragments,
    onFragmentPress,
    onGenerate,
  };
}
