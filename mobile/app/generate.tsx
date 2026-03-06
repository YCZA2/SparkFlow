import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { useSelectedFragments } from '@/features/fragments/hooks';
import { useGenerateScript } from '@/features/scripts/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Fragment } from '@/types/fragment';
import type { ScriptMode } from '@/types/script';

function displayFragmentText(fragment: Fragment): string {
  if (fragment.summary) return fragment.summary;
  if (fragment.transcript) return fragment.transcript.slice(0, 80);
  return '无内容';
}

export default function GenerateScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { fragmentIds } = useLocalSearchParams<{ fragmentIds?: string | string[] }>();
  const { ids, fragments, isLoading, error } = useSelectedFragments(fragmentIds);
  const [mode, setMode] = useState<ScriptMode>('mode_a');
  const generator = useGenerateScript();

  const handleGenerate = async () => {
    if (ids.length === 0) {
      Alert.alert('无法生成', '未接收到选中的碎片');
      return;
    }

    try {
      const script = await generator.run(ids, mode);
      router.replace(`/script/${script.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败';
      Alert.alert('生成失败', message);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: 'AI 编导' }} />
        <LoadingState message="正在读取碎片..." />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: 'AI 编导' }} />
        <ScreenState icon="⚠️" title="加载失败" message={error} actionLabel="返回碎片库" onAction={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: 'AI 编导' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>已选碎片（{ids.length}）</Text>

        {fragments.length === 0 ? (
          <ScreenState title="未选择碎片" message="请返回碎片库至少选择 1 条碎片。" />
        ) : (
          fragments.map((fragment) => (
            <View
              key={fragment.id}
              style={[styles.fragmentCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}
            >
              <Text style={[styles.fragmentText, { color: theme.colors.text }]}>
                {displayFragmentText(fragment)}
              </Text>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>生成模式</Text>

        {[
          ['mode_a', '导师爆款模式', '黄金结构，节奏强，适合直接拍摄'],
          ['mode_b', '我的专属二脑', '更自然，贴近个人表达习惯'],
        ].map(([value, title, description]) => (
          <TouchableOpacity
            key={value}
            style={[
              styles.modeCard,
              theme.shadow.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: mode === value ? theme.colors.primary : 'transparent',
              },
            ]}
            onPress={() => setMode(value as ScriptMode)}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeTitle, { color: theme.colors.text }]}>{title}</Text>
            <Text style={[styles.modeDesc, { color: theme.colors.textSubtle }]}>{description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
        <TouchableOpacity
          style={[styles.generateButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleGenerate}
          disabled={generator.status === 'loading' || ids.length === 0}
          activeOpacity={0.85}
        >
          {generator.status === 'loading' ? (
            <View style={styles.generatingRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.generateButtonText}>AI 正在编写…</Text>
            </View>
          ) : (
            <Text style={styles.generateButtonText}>生成口播稿</Text>
          )}
        </TouchableOpacity>
        {generator.error ? (
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>{generator.error}</Text>
        ) : null}
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
    paddingBottom: 140,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 6,
  },
  fragmentCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  fragmentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  modeCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  modeDesc: {
    fontSize: 13,
    lineHeight: 18,
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
  generateButton: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
  },
});
