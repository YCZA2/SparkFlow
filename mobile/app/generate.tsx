import React from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View, Text } from 'react-native';
import { Stack } from 'expo-router';

import { BottomActionBar } from '@/components/layout/BottomActionBar';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { LoadingState, ScreenState } from '@/components/ScreenState';
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
            className="items-center justify-center rounded-sf-md py-[14px]"
            style={[
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
              <View className="flex-row items-center gap-sf-sm">
                <ActivityIndicator color="#FFFFFF" />
                <Text className="text-base font-bold text-white">AI 正在编写…</Text>
              </View>
            ) : (
              <Text className="text-base font-bold text-white">生成口播稿</Text>
            )}
          </TouchableOpacity>
          {screen.generator.error ? (
            <Text className="mt-sf-sm text-center text-[13px] text-app-danger dark:text-app-danger-dark">
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
        subtitle="只需要一个主题就能生成口播稿；选中的碎片会作为可选背景，帮助 AI 写得更贴近你的素材。"
      />

      <View className="mb-sf-section gap-sf-md">
        <Text className="text-base font-bold text-app-text dark:text-app-text-dark">主题</Text>
        <View
          className="rounded-sf-md border bg-app-surface p-[14px] dark:bg-app-surface-dark"
          style={[
            theme.shadow.card,
            { borderColor: theme.colors.border },
          ]}
        >
          <TextInput
            value={screen.topic}
            onChangeText={screen.setTopic}
            placeholder="例如：为什么稳定输出比追热点更重要"
            placeholderTextColor={theme.colors.textSubtle}
            className="py-0 text-base font-semibold text-app-text dark:text-app-text-dark"
          />
          <Text className="mt-[10px] text-[13px] leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark">
            主题用于驱动大纲选择和参考示例检索，你可以在推荐主题基础上继续细化。
          </Text>
        </View>
      </View>

      <View className="mb-sf-section gap-sf-md">
        <Text className="text-base font-bold text-app-text dark:text-app-text-dark">
          {screen.selectedSummary}
        </Text>

        {screen.fragments.length === 0 ? (
          <ScreenState title="未选择碎片" message="将仅根据主题、SOP 和写作上下文生成口播稿。" />
        ) : (
          screen.fragments.map((fragment) => (
            <View
              key={fragment.id}
              className="rounded-sf-md bg-app-surface p-[14px] dark:bg-app-surface-dark"
              style={[
                theme.shadow.card,
              ]}
            >
              <Text className="text-sm leading-5 text-app-text dark:text-app-text-dark">
                {screen.getFragmentDisplayText(fragment)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}
