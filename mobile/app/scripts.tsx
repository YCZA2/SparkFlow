/**
 * 口播稿列表页面 - 展示所有生成的口播稿
 */

import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  FlatList,
  View,
  Text,
  RefreshControl,
  useColorScheme,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { ScriptCard } from '@/components/ScriptCard';
import { fetchScripts } from '@/services/scripts';
import type { Script } from '@/types/script';

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
        📄
      </Text>
      <Text
        style={[
          styles.emptyTitle,
          { color: isDark ? '#FFFFFF' : '#000000' },
        ]}
      >
        还没有口播稿
      </Text>
      <Text
        style={[
          styles.emptySubtitle,
          { color: isDark ? '#8E8E93' : '#8E8E93' },
        ]}
      >
        去碎片库选择灵感，生成你的第一篇口播稿
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
  onNetworkSettings,
}: {
  message: string;
  isDark: boolean;
  onRetry: () => void;
  onNetworkSettings: () => void;
}) {
  const isNetworkError = message.includes('网络') || message.includes('连接') || message.includes('后端');

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

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: '#007AFF' }]}
        onPress={() => setTimeout(() => onRetry(), 0)}
        activeOpacity={0.8}
      >
        <Text style={styles.actionButtonText}>🔄 点击重试</Text>
      </TouchableOpacity>

      {isNetworkError && (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#5856D6', marginTop: 12 }]}
          onPress={() => setTimeout(() => onNetworkSettings(), 0)}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>🌐 网络设置</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * 口播稿列表页面
 */
export default function ScriptsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [scripts, setScripts] = useState<Script[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 获取口播稿列表
   */
  const loadScripts = useCallback(async () => {
    try {
      setError(null);
      const response = await fetchScripts();
      setScripts(response.items || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败，请重试';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  /**
   * 页面获得焦点时加载数据
   */
  useFocusEffect(
    useCallback(() => {
      loadScripts();
    }, [loadScripts])
  );

  /**
   * 下拉刷新
   */
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadScripts();
  }, [loadScripts]);

  /**
   * 点击卡片跳转详情页
   */
  const handleScriptPress = (script: Script) => {
    router.push(`/script/${script.id}`);
  };

  /**
   * 跳转到网络设置页面
   */
  const handleNetworkSettings = () => {
    router.push('/network-settings');
  };

  /**
   * 渲染列表项
   */
  const renderItem = ({ item }: { item: Script }) => (
    <ScriptCard script={item} onPress={handleScriptPress} />
  );

  /**
   * 渲染列表头部
   */
  const renderHeader = () => {
    if (scripts.length === 0) return null;
    return (
      <View style={styles.header}>
        <Text
          style={[
            styles.headerText,
            { color: isDark ? '#8E8E93' : '#8E8E93' },
          ]}
        >
          共 {scripts.length} 篇口播稿
        </Text>
      </View>
    );
  };

  // 加载中状态
  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? '#000000' : '#F2F2F7' },
        ]}
      >
        <Stack.Screen options={{ title: '我的口播稿' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  // 错误状态
  if (error && scripts.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? '#000000' : '#F2F2F7' },
        ]}
      >
        <Stack.Screen options={{ title: '我的口播稿' }} />
        <ErrorState
          message={error}
          isDark={isDark}
          onRetry={loadScripts}
          onNetworkSettings={handleNetworkSettings}
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
      <Stack.Screen options={{ title: '我的口播稿' }} />

      <FlatList
        data={scripts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={<EmptyState isDark={isDark} />}
        contentContainerStyle={
          scripts.length === 0 ? styles.emptyList : styles.list
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '400',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    textAlign: 'center',
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
    marginBottom: 24,
    lineHeight: 20,
  },
  actionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 160,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});