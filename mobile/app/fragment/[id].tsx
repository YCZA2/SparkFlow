/**
 * 碎片详情页
 * 阶段 4.4 实现：展示碎片完整内容
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { fetchFragmentDetail, deleteFragment } from '@/hooks/useFragments';
import { formatDate } from '@/utils/date';
import type { Fragment } from '@/types/fragment';

/**
 * 解析标签字符串
 * 支持 JSON 数组字符串 '["标签1","标签2"]' 或逗号分隔字符串 '标签1,标签2'
 */
function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return [];
  const trimmed = tagsStr.trim();
  if (!trimmed) return [];
  // 尝试解析为 JSON 数组
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === 'string');
      }
    } catch {
      // JSON 解析失败，回退到逗号分隔
    }
  }
  // 逗号分隔格式
  return trimmed.split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * 获取来源标签显示文本
 */
function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    voice: '语音录入',
    manual: '手动创建',
    video_parse: '视频解析',
  };
  return labels[source] || source;
}

/**
 * 获取同步状态标签
 */
function getSyncStatusLabel(status: string): { text: string; color: string } {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待同步', color: '#FF9500' },
    syncing: { text: '同步中', color: '#007AFF' },
    synced: { text: '已同步', color: '#34C759' },
    failed: { text: '同步失败', color: '#FF3B30' },
  };
  return statusMap[status] || { text: status, color: '#8E8E93' };
}

/**
 * 碎片详情页面
 */
export default function FragmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [fragment, setFragment] = useState<Fragment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 加载碎片详情
   */
  useEffect(() => {
    loadFragmentDetail();
  }, [id]);

  /**
   * 获取碎片详情数据
   */
  const loadFragmentDetail = async () => {
    if (!id) {
      setError('无效的碎片ID');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchFragmentDetail(id);
      setFragment(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 处理删除碎片
   */
  const handleDelete = () => {
    console.log('=== handleDelete 被调用 ===');
    console.log('当前平台:', Platform.OS);

    // Web 平台使用 window.confirm
    if (Platform.OS === 'web') {
      console.log('使用 Web 确认对话框');
      // @ts-ignore
      if (typeof window !== 'undefined' && window.confirm) {
        // @ts-ignore
        const confirmed = window.confirm('删除后将无法恢复，是否继续？');
        console.log('Web 确认结果:', confirmed);
        if (confirmed) {
          confirmDelete();
        }
      } else {
        console.log('window.confirm 不可用，直接删除');
        confirmDelete();
      }
      return;
    }

    // 原生平台使用 Alert
    try {
      Alert.alert(
        '确认删除',
        '删除后将无法恢复，是否继续？',
        [
          {
            text: '取消',
            style: 'cancel',
            onPress: () => console.log('用户点击取消'),
          },
          {
            text: '删除',
            style: 'destructive',
            onPress: () => {
              console.log('用户点击删除');
              confirmDelete();
            },
          },
        ],
        { cancelable: true }
      );
      console.log('Alert.alert 调用完成');
    } catch (err) {
      console.error('Alert 调用失败:', err);
    }
  };

  /**
   * 确认删除操作
   */
  const confirmDelete = async () => {
    console.log('开始删除操作，ID:', id);
    if (!id) {
      console.log('ID 为空，无法删除');
      return;
    }

    try {
      setIsDeleting(true);
      console.log('调用 deleteFragment API');
      await deleteFragment(id);
      console.log('删除 API 调用成功');
      // 删除成功，返回列表页并标记需要刷新
      router.back();
      // 延迟设置参数，确保列表页已挂载
      setTimeout(() => {
        router.setParams({ refresh: 'true' });
      }, 100);
    } catch (err) {
      console.error('删除失败:', err);
      const message = err instanceof Error ? err.message : '删除失败';
      Alert.alert('删除失败', message);
      setIsDeleting(false);
    }
  };

  /**
   * 渲染加载状态
   */
  if (isLoading) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: isDark ? '#000000' : '#F2F2F7' },
        ]}
      >
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, { color: isDark ? '#8E8E93' : '#8E8E93' }]}>
          加载中...
        </Text>
      </View>
    );
  }

  /**
   * 渲染错误状态
   */
  if (error || !fragment) {
    return (
      <View
        style={[
          styles.centerContainer,
          { backgroundColor: isDark ? '#000000' : '#F2F2F7' },
        ]}
      >
        <Text style={[styles.errorIcon, { color: isDark ? '#3A3A3C' : '#C7C7CC' }]}>
          ⚠️
        </Text>
        <Text
          style={[styles.errorTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}
        >
          加载失败
        </Text>
        <Text
          style={[styles.errorMessage, { color: isDark ? '#8E8E93' : '#8E8E93' }]}
        >
          {error || '碎片不存在或已被删除'}
        </Text>
        <TouchableOpacity onPress={loadFragmentDetail} style={styles.retryButton}>
          <Text style={{ color: '#007AFF', fontSize: 16 }}>点击重试</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const syncStatus = getSyncStatusLabel(fragment.sync_status);
  // 后端返回的是 JSON 字符串，需要解析
  const tags: string[] = parseTags(fragment.tags);

  return (
    <>
      {/* 导航栏配置 */}
      <Stack.Screen
        options={{
          title: '碎片详情',
          headerBackTitle: '返回',
          headerRight: () => {
            console.log('渲染headerRight按钮，平台:', Platform.OS);
            // Web 平台使用普通 Button
            if (Platform.OS === 'web') {
              return (
                <button
                  onClick={() => {
                    console.log('Web button onClick 触发');
                    handleDelete();
                  }}
                  disabled={isDeleting}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: '#FF3B30',
                    fontSize: '16px',
                    fontWeight: 500,
                  }}
                >
                  {isDeleting ? '删除中...' : '删除'}
                </button>
              );
            }
            return (
              <TouchableOpacity
                onPress={() => {
                  console.log('TouchableOpacity onPress 触发');
                  handleDelete();
                }}
                disabled={isDeleting}
                activeOpacity={0.6}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.headerButton}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : (
                  <Text style={styles.deleteButton}>删除</Text>
                )}
              </TouchableOpacity>
            );
          },
        }}
      />

      <ScrollView
        style={[
          styles.container,
          { backgroundColor: isDark ? '#000000' : '#F2F2F7' },
        ]}
        contentContainerStyle={styles.contentContainer}
      >
        {/* 顶部信息栏 */}
        <View
          style={[
            styles.headerCard,
            { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
          ]}
        >
          {/* 同步状态 */}
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: syncStatus.color + '20' },
              ]}
            >
              <Text style={[styles.statusText, { color: syncStatus.color }]}>
                {syncStatus.text}
              </Text>
            </View>
            <Text
              style={[
                styles.sourceText,
                { color: isDark ? '#8E8E93' : '#8E8E93' },
              ]}
            >
              {getSourceLabel(fragment.source)}
            </Text>
          </View>

          {/* 创建时间 */}
          <Text
            style={[
              styles.timeText,
              { color: isDark ? '#8E8E93' : '#8E8E93' },
            ]}
          >
            {formatDate(fragment.created_at)}
          </Text>
        </View>

        {/* AI 摘要卡片 */}
        {fragment.summary && (
          <View
            style={[
              styles.card,
              { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: isDark ? '#8E8E93' : '#636366' },
              ]}
            >
              AI 摘要
            </Text>
            <Text
              style={[
                styles.summaryText,
                { color: isDark ? '#FFFFFF' : '#000000' },
              ]}
            >
              {fragment.summary}
            </Text>
          </View>
        )}

        {/* 完整转写文本卡片 */}
        <View
          style={[
            styles.card,
            { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
          ]}
        >
          <Text
            style={[
              styles.cardTitle,
              { color: isDark ? '#8E8E93' : '#636366' },
            ]}
          >
            完整内容
          </Text>
          <Text
            style={[
              styles.transcriptText,
              { color: isDark ? '#FFFFFF' : '#000000' },
            ]}
          >
            {fragment.transcript || '暂无转写内容'}
          </Text>
        </View>

        {/* 标签卡片 */}
        {tags.length > 0 && (
          <View
            style={[
              styles.card,
              { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: isDark ? '#8E8E93' : '#636366' },
              ]}
            >
              标签
            </Text>
            <View style={styles.tagsContainer}>
              {tags.map((tag, index) => (
                <View
                  key={index}
                  style={[
                    styles.tag,
                    { backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7' },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagText,
                      { color: isDark ? '#8E8E93' : '#636366' },
                    ]}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 音频信息卡片（如果有） */}
        {fragment.audio_path && (
          <View
            style={[
              styles.card,
              { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                { color: isDark ? '#8E8E93' : '#636366' },
              ]}
            >
              音频信息
            </Text>
            <Text
              style={[
                styles.audioPathText,
                { color: isDark ? '#8E8E93' : '#8E8E93' },
              ]}
            >
              {fragment.audio_path}
            </Text>
          </View>
        )}

        {/* Web 平台备用删除按钮 */}
        {Platform.OS === 'web' && (
          <View style={styles.webDeleteContainer}>
            <button
              onClick={() => {
                console.log('Web 底部删除按钮点击');
                handleDelete();
              }}
              disabled={isDeleting}
              style={{
                width: '100%',
                padding: '16px',
                backgroundColor: '#FF3B30',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '17px',
                fontWeight: '600',
                cursor: 'pointer',
                opacity: isDeleting ? 0.6 : 1,
              }}
            >
              {isDeleting ? '删除中...' : '删除此碎片'}
            </button>
          </View>
        )}

        {/* 底部占位 */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  // 加载状态
  loadingText: {
    marginTop: 12,
    fontSize: 15,
  },
  // 错误状态
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
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  // 导航栏按钮
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deleteButton: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '500',
  },
  // 头部卡片
  headerCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sourceText: {
    fontSize: 14,
  },
  timeText: {
    fontSize: 14,
  },
  // 内容卡片
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryText: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '500',
  },
  transcriptText: {
    fontSize: 15,
    lineHeight: 24,
  },
  // 标签
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // 音频路径
  audioPathText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  // 底部占位
  bottomSpacer: {
    height: 32,
  },
  // Web 删除按钮容器
  webDeleteContainer: {
    marginTop: 24,
    marginHorizontal: 16,
    marginBottom: 16,
  },
});
