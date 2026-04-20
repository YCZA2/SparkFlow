import React from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { useAppTheme } from '@/theme/useAppTheme';
import type { TestResult } from '@/hooks/useApiTestSuite';

function getStatusIcon(status: TestResult['status']) {
  switch (status) {
    case 'success':
      return '✅';
    case 'error':
      return '❌';
    case 'running':
      return '⏳';
    default:
      return '⏸️';
  }
}

function getStatusColor(status: TestResult['status'], theme: ReturnType<typeof useAppTheme>) {
  switch (status) {
    case 'success':
      return theme.colors.success;
    case 'error':
      return theme.colors.danger;
    case 'running':
      return theme.colors.primary;
    default:
      return theme.colors.textSubtle;
  }
}

export function TestResultCard({ test }: { test: TestResult }) {
  const theme = useAppTheme();

  return (
    <View className="rounded-sf-md bg-app-surface p-sf-lg dark:bg-app-surface-dark" style={theme.shadow.card}>
      <View className="mb-sf-sm flex-row items-center">
        <Text className="mr-sf-sm text-xl">{getStatusIcon(test.status)}</Text>
        <Text className="flex-1 text-[15px] font-semibold" style={{ color: getStatusColor(test.status, theme) }}>
          {test.name}
        </Text>
        {test.status === 'running' ? <ActivityIndicator size="small" className="ml-sf-sm" /> : null}
      </View>

      {test.message ? (
        <Text className="mt-sf-xs pl-7 text-[13px] text-app-text-muted dark:text-app-text-muted-dark">
          {test.message}
        </Text>
      ) : null}

      {test.data ? (
        <Text className="ml-7 mt-sf-sm rounded px-sf-sm py-sf-sm font-mono text-[11px] text-app-text-subtle bg-app-surface-muted dark:text-app-text-subtle-dark dark:bg-app-surface-muted-dark">
          {JSON.stringify(test.data, null, 2).substring(0, 200)}
          {JSON.stringify(test.data, null, 2).length > 200 ? '...' : ''}
        </Text>
      ) : null}
    </View>
  );
}
