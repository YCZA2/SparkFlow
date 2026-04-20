import React from 'react';
import { View, Text } from 'react-native';
import { Stack } from 'expo-router';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { useAppTheme } from '@/theme/useAppTheme';

export default function KnowledgePlaceholderScreen() {
  const theme = useAppTheme();

  return (
    <ScreenContainer padded scrollable contentContainerStyle={{ paddingTop: 20, paddingBottom: 32, gap: 20 }}>
      <Stack.Screen options={{ title: '知识库', headerShown: true }} />

      <View className="gap-sf-sm">
        <Text className="text-[30px] font-extrabold text-app-text dark:text-app-text-dark">知识库入口预留中</Text>
        <Text className="text-[15px] leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">
          这里后续会支持上传方法论、粘贴高赞文案，以及沉淀你的表达习惯。
        </Text>
      </View>

      <View
        className="gap-[10px] rounded-[20px] border bg-app-surface p-[18px] dark:bg-app-surface-dark"
        style={[
          theme.shadow.card,
          {
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text className="text-lg font-bold text-app-text dark:text-app-text-dark">后续会接入</Text>
        <Text className="text-sm leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">
          支持 TXT / Word 上传、手动粘贴文本、文档类型选择，以及知识库列表管理。
        </Text>
      </View>
    </ScreenContainer>
  );
}
