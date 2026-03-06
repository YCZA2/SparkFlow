import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Themed';
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
    <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.header}>
        <Text style={styles.icon}>{getStatusIcon(test.status)}</Text>
        <Text style={[styles.name, { color: getStatusColor(test.status, theme) }]}>{test.name}</Text>
        {test.status === 'running' ? <ActivityIndicator size="small" style={styles.runningIndicator} /> : null}
      </View>

      {test.message ? (
        <Text style={[styles.message, { color: theme.colors.textMuted }]}>{test.message}</Text>
      ) : null}

      {test.data ? (
        <Text style={[styles.data, { color: theme.colors.textSubtle, backgroundColor: theme.colors.surfaceMuted }]}>
          {JSON.stringify(test.data, null, 2).substring(0, 200)}
          {JSON.stringify(test.data, null, 2).length > 200 ? '...' : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 20,
    marginRight: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  runningIndicator: {
    marginLeft: 8,
  },
  message: {
    fontSize: 13,
    marginTop: 4,
    paddingLeft: 28,
  },
  data: {
    fontSize: 11,
    marginTop: 8,
    marginLeft: 28,
    padding: 8,
    borderRadius: 4,
    fontFamily: 'monospace',
  },
});
