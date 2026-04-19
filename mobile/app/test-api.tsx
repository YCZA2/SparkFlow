import React from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { isDeveloperToolsEnabled } from '@/constants/appConfig';
import { TestResultCard } from '@/components/TestResultCard';
import { useApiTestSuite } from '@/hooks/useApiTestSuite';
import { useAppTheme } from '@/theme/useAppTheme';

export default function ApiTestScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const developerToolsEnabled = isDeveloperToolsEnabled();
  const { backendUrl, tests, isRunningAll, runAllTests, actions } = useApiTestSuite();

  if (!developerToolsEnabled) {
    /*正式包即使直接命中调试页，也只展示拒绝态而不暴露测试动作。 */
    return (
      <>
        <Stack.Screen options={{ title: 'API 测试' }} />
        <View className="flex-1 bg-app-background dark:bg-app-background-dark">
          <ScreenState
            icon="🔒"
            title="当前环境不可用"
            message="正式环境已移除 API 测试入口。"
            actionLabel="返回工作台"
            onAction={() => router.replace('/profile')}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'API 测试' }} />
      <ScrollView
        className="flex-1 bg-app-background dark:bg-app-background-dark"
        contentContainerClassName="p-sf-lg pb-10"
      >
        <Text className="mb-sf-xs text-[28px] font-bold text-app-text dark:text-app-text-dark">API 服务测试</Text>
        <Text className="mb-sf-lg text-sm text-app-text-muted dark:text-app-text-muted-dark">
          验证 `services/` 模块所有 API
        </Text>

        <View className="mb-sf-lg flex-row items-center rounded-sf-sm bg-app-surface p-sf-md dark:bg-app-surface-dark" style={theme.shadow.card}>
          <Text className="mr-sf-sm text-sm text-app-text-muted dark:text-app-text-muted-dark">后端地址:</Text>
          <Text className="flex-1 text-sm font-medium text-app-text dark:text-app-text-dark">
            {backendUrl || '加载中...'}
          </Text>
        </View>

        <TouchableOpacity
          className="mb-5 items-center rounded-[10px] py-[14px]"
          style={{ backgroundColor: isRunningAll ? theme.colors.textSubtle : theme.colors.primary }}
          onPress={runAllTests}
          disabled={isRunningAll}
        >
          {isRunningAll ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-base font-semibold text-white">运行全部测试</Text>
          )}
        </TouchableOpacity>

        <View className="gap-sf-md">
          {tests.map((test) => (
            <TestResultCard key={test.name} test={test} />
          ))}
        </View>

        <Text className="mb-sf-md mt-sf-section text-base font-semibold text-app-text dark:text-app-text-dark">单项测试</Text>
        <View className="flex-row flex-wrap gap-sf-sm">
          {actions.map((action) => (
            <TouchableOpacity
              key={action.label}
              className="rounded-sf-sm px-sf-lg py-[10px]"
              style={{ backgroundColor: theme.colors.success }}
              onPress={action.run}
            >
              <Text className="text-sm font-medium text-white">{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </>
  );
}
