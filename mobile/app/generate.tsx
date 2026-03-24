import React from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import { BottomActionBar } from '@/components/layout/BottomActionBar';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { LoadingState, ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { useGenerateScreen } from '@/features/scripts/useGenerateScreen';
import { useAppTheme } from '@/theme/useAppTheme';

export default function GenerateScreen() {
  const theme = useAppTheme();
  const screen = useGenerateScreen();

  if (screen.isLoading) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ title: 'AI 编导' }} />
        <LoadingState message="正在读取碎片..." />
      </ScreenContainer>
    );
  }

  if (screen.error) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ title: 'AI 编导' }} />
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={screen.error}
          actionLabel="返回碎片库"
          onAction={screen.goBack}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      footer={
        <BottomActionBar>
          <TouchableOpacity
            style={[
              styles.generateButton,
              {
                backgroundColor: screen.canGenerate
                  ? theme.colors.primary
                  : theme.colors.textSubtle,
              },
            ]}
            onPress={screen.generate}
            disabled={!screen.canGenerate}
            activeOpacity={0.85}
          >
            {screen.generator.status === 'loading' ? (
              <View style={styles.generatingRow}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.generateButtonText}>AI 正在编写…</Text>
              </View>
            ) : (
              <Text style={styles.generateButtonText}>生成口播稿</Text>
            )}
          </TouchableOpacity>
          {screen.generator.error ? (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              {screen.generator.error}
            </Text>
          ) : null}
        </BottomActionBar>
      }
      includeBottomInset
      padded
      scrollable
    >
      <Stack.Screen options={{ title: 'AI 编导' }} />

      <ScreenHeader
        eyebrow="生成"
        title="AI 编导"
        subtitle="先给这组素材一个主题，AI 会按 SOP 和 few-shot 参考整理成可直接拍摄的口播稿。"
      />

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>主题</Text>
        <View
          style={[
            styles.topicCard,
            theme.shadow.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <TextInput
            value={screen.topic}
            onChangeText={screen.setTopic}
            placeholder="例如：为什么稳定输出比追热点更重要"
            placeholderTextColor={theme.colors.textSubtle}
            style={[styles.topicInput, { color: theme.colors.text }]}
          />
          <Text style={[styles.topicHint, { color: theme.colors.textSubtle }]}>
            主题用于驱动大纲选择和参考示例检索，你可以在推荐主题基础上继续细化。
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          {screen.selectedSummary}
        </Text>

        {screen.fragments.length === 0 ? (
          <ScreenState title="未选择碎片" message="请返回碎片库至少选择 1 条碎片。" />
        ) : (
          screen.fragments.map((fragment) => (
            <View
              key={fragment.id}
              style={[
                styles.fragmentCard,
                theme.shadow.card,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Text style={[styles.fragmentText, { color: theme.colors.text }]}>
                {screen.getFragmentDisplayText(fragment)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  fragmentCard: {
    borderRadius: 12,
    padding: 14,
  },
  fragmentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  topicCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  topicInput: {
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 0,
  },
  topicHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
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
