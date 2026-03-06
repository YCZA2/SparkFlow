import React, { useCallback } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { FragmentCard } from '@/components/FragmentCard';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { useFragmentSelection, useFragments } from '@/features/fragments/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Fragment } from '@/types/fragment';

export default function FragmentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ refresh?: string }>();
  const theme = useAppTheme();
  const {
    fragments,
    isLoading,
    isRefreshing,
    error,
    refreshFragments,
    fetchFragments,
  } = useFragments();
  const selection = useFragmentSelection(20);

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

      <FlatList
        data={fragments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FragmentCard
            fragment={item}
            onPress={handleFragmentPress}
            selectable={selection.isSelectionMode}
            selected={selection.selectedSet.has(item.id)}
          />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerText, { color: theme.colors.textSubtle }]}>
                共 {fragments.length} 条灵感
              </Text>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]}>试试灵感云图</Text>
              <Text style={[styles.headerDesc, { color: theme.colors.textSubtle }]}>
                把碎片按主题聚在一起看，再从一个主题继续生成口播稿。
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.cloudButton, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}
              onPress={handleOpenCloud}
              activeOpacity={0.85}
            >
              <Text style={[styles.cloudButtonText, { color: theme.colors.primary }]}>打开云图</Text>
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
    paddingTop: 8,
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  headerDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  headerText: {
    fontSize: 13,
  },
  cloudButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cloudButtonText: {
    fontSize: 14,
    fontWeight: '700',
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
    borderRadius: 12,
  },
  generateButton: {
    borderRadius: 10,
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
