import React from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenState } from '@/components/ScreenState';
import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Text } from '@/components/Themed';
import { isDeveloperToolsEnabled } from '@/constants/appConfig';
import { useDebugLogs } from '@/providers/DebugLogProvider';
import { useAppTheme } from '@/theme/useAppTheme';

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatContext(context: Record<string, unknown> | undefined): string {
  if (!context) {
    return '';
  }
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
}

export default function DebugLogsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const developerToolsEnabled = isDeveloperToolsEnabled();
  const { logs, clearLogs } = useDebugLogs();

  if (!developerToolsEnabled) {
    /*生产包不暴露调试日志页，防止误把开发诊断入口带进正式环境。 */
    return (
      <ScreenContainer>
        <View className="flex-1 bg-app-background dark:bg-app-background-dark">
          <ScreenState
            icon="🔒"
            title="当前环境不可用"
            message="正式环境已隐藏调试日志入口。"
            actionLabel="返回工作台"
            onAction={() => router.replace('/profile')}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable padded>
      <ScreenHeader
        title="错误日志"
        subtitle="这里会自动记录 JS 异常、API 错误和 console.error，便于排查真机问题。"
        trailing={
          <Pressable
            className="rounded-sf-pill border px-[14px] py-sf-sm"
            style={{ borderColor: theme.colors.border }}
            onPress={() => {
              Alert.alert('清空日志', '确定要清空当前本地错误日志吗？', [
                { text: '取消', style: 'cancel' },
                { text: '清空', style: 'destructive', onPress: () => void clearLogs() },
              ]);
            }}
          >
            <Text className="text-[13px] font-semibold text-app-text dark:text-app-text-dark">清空</Text>
          </Pressable>
        }
      />

      {logs.length === 0 ? (
        <View
          className="mt-sf-md rounded-[20px] border bg-app-surface p-5 dark:bg-app-surface-dark"
          style={[
            theme.shadow.card,
            { borderColor: theme.colors.border },
          ]}
        >
          <Text className="text-lg font-bold text-app-text dark:text-app-text-dark">暂无日志</Text>
          <Text className="mt-sf-sm text-sm leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
            当前没有捕获到错误。后续如果页面报错、接口失败或出现红屏，这里会留下记录。
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-sf-md pb-8" showsVerticalScrollIndicator={false}>
          {logs.map((log) => (
            <View
              key={log.id}
              className="rounded-[18px] border bg-app-surface p-sf-lg dark:bg-app-surface-dark"
              style={[
                theme.shadow.card,
                { borderColor: theme.colors.border },
              ]}
            >
              <View className="flex-row justify-between gap-sf-md">
                <Text className="text-xs font-extrabold uppercase tracking-[0.8px] text-app-danger dark:text-app-danger-dark">
                  {log.level.toUpperCase()}
                </Text>
                <Text className="text-xs text-app-text-subtle dark:text-app-text-subtle-dark">
                  {formatTimestamp(log.timestamp)}
                </Text>
              </View>
              <Text className="mt-sf-sm text-[13px] font-bold text-app-primary dark:text-app-primary-dark">{log.source}</Text>
              <Text className="mt-sf-sm text-[15px] leading-[22px] text-app-text dark:text-app-text-dark">{log.message}</Text>
              {log.context ? (
                <Text className="mt-[10px] font-mono text-xs leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark">
                  {formatContext(log.context)}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
