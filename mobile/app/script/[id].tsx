import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { fetchScriptDetail } from '@/features/scripts/api';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Script } from '@/types/script';
import { formatDate } from '@/utils/date';

function modeLabel(mode: string): string {
  return mode === 'mode_a' ? '导师爆款模式' : '我的专属二脑';
}

export default function ScriptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const [script, setScript] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('无效的口播稿 ID');
        setIsLoading(false);
        return;
      }

      try {
        setError(null);
        setIsLoading(true);
        const detail = await fetchScriptDetail(id);
        setScript(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [id]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '口播稿详情' }} />
        <LoadingState message="加载中..." />
      </View>
    );
  }

  if (error || !script) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '口播稿详情' }} />
        <ScreenState icon="⚠️" title="加载失败" message={error || '口播稿不存在'} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: '口播稿详情' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.metaCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.metaRow, { color: theme.colors.text }]}>模式：{modeLabel(script.mode)}</Text>
          <Text style={[styles.metaRow, { color: theme.colors.text }]}>状态：{script.status}</Text>
          <Text style={[styles.metaRow, { color: theme.colors.textSubtle }]}>
            创建时间：{script.created_at ? formatDate(script.created_at) : '-'}
          </Text>
        </View>

        <View style={[styles.contentCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.contentTitle, { color: theme.colors.text }]}>文案内容</Text>
          <Text style={[styles.scriptContent, { color: theme.colors.text }]}>{script.body_markdown || script.content || '无内容'}</Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
        <TouchableOpacity
          style={[styles.shootButton, { backgroundColor: theme.colors.danger }]}
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: '/shoot',
              params: {
                script_id: script.id,
                content: script.body_markdown ?? script.content ?? '',
              },
            })
          }
        >
          <Text style={styles.shootButtonText}>一键去拍摄</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 96,
  },
  metaCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  metaRow: {
    fontSize: 14,
    lineHeight: 22,
  },
  contentCard: {
    borderRadius: 12,
    padding: 14,
  },
  contentTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  scriptContent: {
    fontSize: 15,
    lineHeight: 24,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  shootButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shootButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
