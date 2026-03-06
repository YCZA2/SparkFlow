import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/Themed';
import { TestResultCard } from '@/components/TestResultCard';
import { useApiTestSuite } from '@/hooks/useApiTestSuite';
import { useAppTheme } from '@/theme/useAppTheme';

export default function ApiTestScreen() {
  const theme = useAppTheme();
  const { backendUrl, tests, isRunningAll, runAllTests, actions } = useApiTestSuite();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>API 服务测试</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        验证 `services/` 模块所有 API
      </Text>

      <View style={[styles.infoBox, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>后端地址:</Text>
        <Text style={[styles.infoValue, { color: theme.colors.text }]}>
          {backendUrl || '加载中...'}
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.runAllButton,
          { backgroundColor: isRunningAll ? theme.colors.textSubtle : theme.colors.primary },
        ]}
        onPress={runAllTests}
        disabled={isRunningAll}
      >
        {isRunningAll ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.runAllButtonText}>运行全部测试</Text>
        )}
      </TouchableOpacity>

      <View style={styles.testList}>
        {tests.map((test) => (
          <TestResultCard key={test.name} test={test} />
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>单项测试</Text>
      <View style={styles.singleTestButtons}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[styles.singleTestBtn, { backgroundColor: theme.colors.success }]}
            onPress={action.run}
          >
            <Text style={styles.singleTestBtnText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  infoBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    marginRight: 8,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  runAllButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  runAllButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  testList: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
  },
  singleTestButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  singleTestBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  singleTestBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
});
