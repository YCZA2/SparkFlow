import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Text } from '@/components/Themed';
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
  const { logs, clearLogs } = useDebugLogs();

  return (
    <ScreenContainer scrollable padded>
      <ScreenHeader
        title="错误日志"
        subtitle="这里会自动记录 JS 异常、API 错误和 console.error，便于排查真机问题。"
        trailing={
          <Pressable
            style={[styles.clearButton, { borderColor: theme.colors.border }]}
            onPress={() => {
              Alert.alert('清空日志', '确定要清空当前本地错误日志吗？', [
                { text: '取消', style: 'cancel' },
                { text: '清空', style: 'destructive', onPress: () => void clearLogs() },
              ]);
            }}
          >
            <Text style={[styles.clearButtonText, { color: theme.colors.text }]}>清空</Text>
          </Pressable>
        }
      />

      {logs.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            theme.shadow.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>暂无日志</Text>
          <Text style={[styles.emptySubtitle, { color: theme.colors.textSubtle }]}>
            当前没有捕获到错误。后续如果页面报错、接口失败或出现红屏，这里会留下记录。
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.logList} showsVerticalScrollIndicator={false}>
          {logs.map((log) => (
            <View
              key={log.id}
              style={[
                styles.logCard,
                theme.shadow.card,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}
            >
              <View style={styles.logHeader}>
                <Text style={[styles.levelText, { color: theme.colors.danger }]}>
                  {log.level.toUpperCase()}
                </Text>
                <Text style={[styles.timeText, { color: theme.colors.textSubtle }]}>
                  {formatTimestamp(log.timestamp)}
                </Text>
              </View>
              <Text style={[styles.sourceText, { color: theme.colors.primary }]}>{log.source}</Text>
              <Text style={[styles.messageText, { color: theme.colors.text }]}>{log.message}</Text>
              {log.context ? (
                <Text style={[styles.contextText, { color: theme.colors.textSubtle }]}>
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

const styles = StyleSheet.create({
  clearButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  logList: {
    gap: 12,
    paddingBottom: 32,
  },
  logCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  timeText: {
    fontSize: 12,
  },
  sourceText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
  },
  messageText: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
  },
  contextText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'SpaceMono',
  },
});
