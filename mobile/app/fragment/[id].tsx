import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { deleteFragment, fetchFragmentDetail } from '@/services/fragments';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Fragment } from '@/types/fragment';
import { formatDate } from '@/utils/date';

function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return [];
  const trimmed = tagsStr.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((tag): tag is string => typeof tag === 'string');
      }
    } catch {
      // Fallback handled below.
    }
  }
  return trimmed.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    voice: '语音录入',
    manual: '手动创建',
    video_parse: '视频解析',
  };
  return labels[source] || source;
}

function getSyncStatusLabel(theme: ReturnType<typeof useAppTheme>, status: string) {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待同步', color: theme.colors.warning },
    syncing: { text: '同步中', color: theme.colors.primary },
    synced: { text: '已同步', color: theme.colors.success },
    failed: { text: '同步失败', color: theme.colors.danger },
  };
  return statusMap[status] || { text: status, color: theme.colors.textSubtle };
}

export default function FragmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const [fragment, setFragment] = useState<Fragment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('无效的碎片ID');
        setIsLoading(false);
        return;
      }

      try {
        setError(null);
        setIsLoading(true);
        const data = await fetchFragmentDetail(id);
        setFragment(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [id]);

  const confirmDelete = async () => {
    if (!id) return;

    try {
      setIsDeleting(true);
      await deleteFragment(id);
      router.replace({
        pathname: '/(tabs)/fragments',
        params: { refresh: 'true' },
      });
    } catch (err) {
      setIsDeleting(false);
      Alert.alert('删除失败', err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleDelete = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('删除后将无法恢复，是否继续？')) {
        confirmDelete();
      }
      return;
    }

    Alert.alert('确认删除', '删除后将无法恢复，是否继续？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          confirmDelete();
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '碎片详情' }} />
        <LoadingState message="加载中..." />
      </View>
    );
  }

  if (error || !fragment) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '碎片详情' }} />
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={error || '碎片不存在或已被删除'}
          actionLabel="点击重试"
          onAction={() => router.replace(`/fragment/${id}`)}
        />
      </View>
    );
  }

  const syncStatus = getSyncStatusLabel(theme, fragment.sync_status);
  const tags = parseTags(fragment.tags);

  return (
    <>
      <Stack.Screen
        options={{
          title: '碎片详情',
          headerRight: () => (
            <TouchableOpacity onPress={handleDelete} disabled={isDeleting} hitSlop={8}>
              <Text style={[styles.deleteButton, { color: theme.colors.danger }]}>
                {isDeleting ? '删除中...' : '删除'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={[styles.headerCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: `${syncStatus.color}20` }]}>
              <Text style={[styles.statusText, { color: syncStatus.color }]}>{syncStatus.text}</Text>
            </View>
            <Text style={[styles.sourceText, { color: theme.colors.textSubtle }]}>
              {getSourceLabel(fragment.source)}
            </Text>
          </View>
          <Text style={[styles.timeText, { color: theme.colors.textSubtle }]}>
            {formatDate(fragment.created_at)}
          </Text>
        </View>

        {fragment.summary ? (
          <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.textSubtle }]}>AI 摘要</Text>
            <Text style={[styles.summaryText, { color: theme.colors.text }]}>{fragment.summary}</Text>
          </View>
        ) : null}

        <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.textSubtle }]}>完整内容</Text>
          <Text style={[styles.transcriptText, { color: theme.colors.text }]}>
            {fragment.transcript || '暂无转写内容'}
          </Text>
        </View>

        {tags.length > 0 ? (
          <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.textSubtle }]}>标签</Text>
            <View style={styles.tagsContainer}>
              {tags.map((tag) => (
                <View
                  key={tag}
                  style={[styles.tag, { backgroundColor: theme.colors.surfaceMuted }]}
                >
                  <Text style={[styles.tagText, { color: theme.colors.textSubtle }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {fragment.audio_path ? (
          <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.textSubtle }]}>音频信息</Text>
            <Text style={[styles.audioPathText, { color: theme.colors.textSubtle }]}>
              {fragment.audio_path}
            </Text>
          </View>
        ) : null}

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
  deleteButton: {
    fontSize: 16,
    fontWeight: '500',
    marginRight: 12,
  },
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
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
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
  audioPathText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  bottomSpacer: {
    height: 32,
  },
});
