/**
 * 碎片库页面 - 展示所有灵感碎片列表
 * 阶段 4.3 实现完整功能
 */

import React, { useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  View,
  Text,
  RefreshControl,
  useColorScheme,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { FragmentCard } from '@/components/FragmentCard';
import { useFragments } from '@/hooks/useFragments';
import type { Fragment } from '@/types/fragment';

/**
 * 空状态组件
 */
function EmptyState({ isDark }: { isDark: boolean }) {
  return (
    <View style={styles.emptyContainer}>
      <Text
        style={[
          styles.emptyIcon,
          { color: isDark ? '#3A3A3C' : '#C7C7CC' },
        ]}
      >
        📝
      </Text>
      <Text
        style={[
          styles.emptyTitle,
          { color: isDark ? '#FFFFFF' : '#000000' },
        ]}
      >
        还没有灵感碎片
      </Text>
      <Text
        style={[
          styles.emptySubtitle,
          { color: isDark ? '#8E8E93' : '#8E8E93' },
        ]}
      >
        去首页录一条吧
      </Text>
    </View>
  );
}

/**
 * 错误状态组件
 */
function ErrorState({
  message,
  isDark,
  onRetry,
}: {
  message: string;
  isDark: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorContainer}>
      <Text
        style={[
          styles.errorIcon,
          { color: isDark ? '#3A3A3C' : '#C7C7CC' },
        ]}
      >
        ⚠️
      </Text>
      <Text
        style={[
          styles.errorTitle,
          { color: isDark ? '#FFFFFF' : '#000000' },
        ]}
      >
        加载失败
      </Text>
      <Text
        style={[
          styles.errorMessage,
          { color: isDark ? '#8E8E93' : '#8E8E93' },
        ]}
      >
        {message}
      </Text>
      <Text
        style={[styles.retryButton, { color: '#007AFF' }]}
        onPress={onRetry}
      >
        点击重试
      </Text>
    </View>
  );
}

/**
 * 碎片库列表页面
 */
export default function FragmentsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const {
    fragments,
    isLoading,
    isRefreshing,
    error,
    refreshFragments,
    fetchFragments,
  } = useFragments();

  /**
   * 页面获得焦点时自动刷新（从详情页返回时）
   */
  useFocusEffect(
    useCallback(() => {
      console.log('碎片库页面获得焦点，自动刷新');
      refreshFragments();
    }, [refreshFragments])
  );

  /**
   * 处理卡片点击 - 导航到详情页
   */
  const handleFragmentPress = (fragment: Fragment) => {
    router.push(`/fragment/${fragment.id}`);
  };

  /**
   * 渲染列表项
   */
  const renderItem = ({ item }: { item: Fragment }) => (
    <FragmentCard fragment={item} onPress={handleFragmentPress} />
  );

  /**
   * 渲染列表分隔线
   */
  const renderSeparator = () => <View style={styles.separator} />;

  /**
   * 渲染列表头部（显示总数）
   */
  const renderHeader = () => {
    if (fragments.length === 0) return null;
    return (
      <View style={styles.header}>
        <Text
          style={[
            styles.headerText,
            { color: isDark ? '#8E8E93' : '#8E8E93' },
          ]}
        >
          共 {fragments.length} 条灵感
        </Text>
      </View>
    );
  };

  // 显示错误状态
  if (error && !isLoading && fragments.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? '#000000' : '#F2F2F7' },
        ]}
      >
        <ErrorState
          message={error}
          isDark={isDark}
          onRetry={fetchFragments}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? '#000000' : '#F2F2F7' },
      ]}
    >
      <FlatList
        data={fragments}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={renderSeparator}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !isLoading ? <EmptyState isDark={isDark} /> : null
        }
        contentContainerStyle={
          fragments.length === 0 ? styles.emptyList : styles.list
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshFragments}
            tintColor={isDark ? '#FFFFFF' : '#000000'}
          />
        }
        showsVerticalScrollIndicator={false}
      />
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
    flex: 1,
  },
  separator: {
    height: 0,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '400',
  },
  // 空状态样式
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
  },
  // 错误状态样式
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    fontSize: 15,
    fontWeight: '500',
  },
});
