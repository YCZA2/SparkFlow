import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { fetchScriptDetail } from '@/services/scripts';
import { formatDate } from '@/utils/date';
import type { Script } from '@/types/script';

function modeLabel(mode: string): string {
  return mode === 'mode_a' ? '导师爆款模式' : '我的专属二脑';
}

export default function ScriptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
        const detail = await fetchScriptDetail(id);
        setScript(detail);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [id]);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F2F2F7' }]}>
      <Stack.Screen options={{ title: '口播稿详情' }} />

      {isLoading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={[styles.helperText, { color: '#8E8E93' }]}>加载中...</Text>
        </View>
      ) : error || !script ? (
        <View style={styles.centerWrap}>
          <Text style={[styles.errorText, { color: '#FF3B30' }]}>{error || '口播稿不存在'}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={[styles.metaCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
              <Text style={[styles.metaRow, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                模式：{modeLabel(script.mode)}
              </Text>
              <Text style={[styles.metaRow, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                状态：{script.status}
              </Text>
              <Text style={[styles.metaRow, { color: '#8E8E93' }]}>
                创建时间：{script.created_at ? formatDate(script.created_at) : '-'}
              </Text>
            </View>

            <View style={[styles.contentCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
              <Text style={[styles.contentTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                文案内容
              </Text>
              <Text style={[styles.scriptContent, { color: isDark ? '#E5E5EA' : '#111111' }]}>
                {script.content || '无内容'}
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.bottomBar, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
            <TouchableOpacity
              style={styles.shootButton}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/shoot',
                  params: {
                    script_id: script.id,
                    content: script.content ?? '',
                  },
                })
              }
            >
              <Text style={styles.shootButtonText}>一键去拍摄</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperText: {
    marginTop: 8,
    fontSize: 14,
  },
  errorText: {
    fontSize: 14,
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
    borderTopColor: '#D1D1D6',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  shootButton: {
    backgroundColor: '#FF3B30',
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
