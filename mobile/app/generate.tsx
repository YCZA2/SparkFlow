import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
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
        subtitle="确认选中的碎片和生成模式，整理成一篇可直接拍摄的口播稿。"
      />

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

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>生成模式</Text>
        {screen.modeOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.modeCard,
              theme.shadow.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor:
                  screen.mode === option.value ? theme.colors.primary : 'transparent',
              },
            ]}
            onPress={() => screen.setMode(option.value)}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeTitle, { color: theme.colors.text }]}>{option.title}</Text>
            <Text style={[styles.modeDesc, { color: theme.colors.textSubtle }]}>
              {option.description}
            </Text>
          </TouchableOpacity>
        ))}
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
  modeCard: {
    borderRadius: 12,
    padding: 14,
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
