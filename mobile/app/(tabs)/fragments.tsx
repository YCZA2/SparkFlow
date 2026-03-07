import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  RefreshControl,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { FragmentCard } from '@/components/FragmentCard';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { useFragmentSelection, useFragments } from '@/features/fragments/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Fragment } from '@/types/fragment';

interface FragmentSection {
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

export default function FragmentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ refresh?: string }>();
  const theme = useAppTheme();
  const { fragments, isLoading, isRefreshing, error, refreshFragments, fetchFragments } =
    useFragments();
  const selection = useFragmentSelection(20);

  const sections = useMemo(() => buildSections(fragments), [fragments]);

  useFocusEffect(
    useCallback(() => {
      if (params.refresh === 'true') {
        fetchFragments();
        router.setParams({ refresh: undefined });
      }
    }, [fetchFragments, params.refresh, router])
  );

  const handleFragmentPress = (fragment: Fragment) => {
    if (selection.isSelectionMode) {
      const accepted = selection.toggleSelect(fragment.id);
      if (!accepted) {
        Alert.alert('已达上限', `最多选择 ${selection.maxSelection} 条碎片`);
      }
      return;
    }

    router.push(`/fragment/${fragment.id}`);
  };

  const handleGoGenerate = () => {
    if (selection.selectedCount === 0) {
      Alert.alert('请选择碎片', '请至少选择 1 条碎片');
      return;
    }

    router.push({
      pathname: '/generate',
      params: { fragmentIds: selection.selectedIds.join(',') },
    });
  };

  const handleOpenCloud = () => {
    router.push('/fragment-cloud' as never);
  };

  if (isLoading && fragments.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '碎片库' }} />
        <LoadingState message="正在加载碎片..." />
      </View>
    );
  }

  if (error && fragments.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '碎片库' }} />
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={error}
          actionLabel="点击重试"
          onAction={fetchFragments}
          secondaryActionLabel="网络设置"
          onSecondaryAction={() => router.push('/network-settings')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: '碎片库',
          headerRight: () => (
            <TouchableOpacity onPress={selection.toggleSelectionMode} hitSlop={8}>
              <Text style={[styles.selectAction, { color: theme.colors.primary }]}>
                {selection.isSelectionMode ? '取消' : '选择'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index, section }) => (
          <FragmentCard
            fragment={item}
            onPress={handleFragmentPress}
            selectable={selection.isSelectionMode}
            selected={selection.selectedSet.has(item.id)}
            isFirstInSection={index === 0}
            isLastInSection={index === section.data.length - 1}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{section.title}</Text>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.totalCount, { color: theme.colors.textSubtle }]}>
              {fragments.length} 条灵感
            </Text>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>全部碎片</Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.textSubtle }]}>
              像备忘录一样翻看你的语音记录和文字记录。
            </Text>

            <TouchableOpacity
              style={[
                styles.cloudButton,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
              onPress={handleOpenCloud}
              activeOpacity={0.85}
            >
              <Text style={[styles.cloudButtonText, { color: theme.colors.primary }]}>
                打开灵感云图
              </Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <ScreenState icon="📝" title="还没有灵感碎片" message="去首页录一条吧" />
        }
        contentContainerStyle={fragments.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshFragments}
            tintColor={theme.colors.primary}
          />
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />

      {selection.isSelectionMode ? (
        <View style={[styles.floatingBar, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <TouchableOpacity
            style={[
              styles.generateButton,
              {
                backgroundColor:
                  selection.selectedCount > 0 ? theme.colors.primary : theme.colors.textSubtle,
              },
            ]}
            onPress={handleGoGenerate}
            activeOpacity={0.85}
          >
            <Text style={styles.generateButtonText}>
              交给 AI 编导（已选 {selection.selectedCount}/{selection.maxSelection} 条）
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingBottom: 36,
  },
  emptyList: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  totalCount: {
    fontSize: 16,
    fontWeight: '500',
  },
  heroTitle: {
    marginTop: 2,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
  },
  cloudButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  cloudButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  selectAction: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 16,
  },
  floatingBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    padding: 10,
    borderRadius: 16,
  },
  generateButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
