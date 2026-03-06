import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { useNetworkSettings } from '@/features/network/hooks';
import { useAppTheme } from '@/theme/useAppTheme';

const DEFAULT_URL = 'http://192.168.31.157:8000';

export default function NetworkSettingsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const {
    currentUrl,
    inputUrl,
    setInputUrl,
    isTesting,
    isAutoDiscovering,
    testResult,
    possibleUrls,
    diagnostics,
    testCurrentUrl,
    saveCurrentUrl,
    autoDiscover,
    resetToDefault,
  } = useNetworkSettings();

  const handleTest = async () => {
    const result = await testCurrentUrl();
    if (!inputUrl.trim()) {
      Alert.alert('错误', result.message);
    }
  };

  const handleSave = async () => {
    if (!inputUrl.trim()) {
      Alert.alert('错误', '请输入后端地址');
      return;
    }

    try {
      await saveCurrentUrl();
      Alert.alert('保存成功', `后端地址已更新为: ${inputUrl.trim()}`, [
        {
          text: '确定',
          onPress: () => router.back(),
        },
      ]);
    } catch (err) {
      Alert.alert('保存失败', (err as Error).message);
    }
  };

  const handleReset = async () => {
    await resetToDefault(DEFAULT_URL);
    Alert.alert('重置成功', '已恢复默认地址');
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: '网络设置',
          headerShown: true,
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
      >
        <View style={[styles.section, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>当前配置</Text>
          <Text style={[styles.currentUrl, { color: theme.colors.textSubtle }]}>{currentUrl}</Text>
          {diagnostics?.deviceIp ? (
            <Text style={[styles.deviceIp, { color: theme.colors.textSubtle }]}>
              本机 IP: {diagnostics.deviceIp}
            </Text>
          ) : null}
        </View>

        <View style={[styles.section, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>后端地址</Text>
          <Text style={[styles.hint, { color: theme.colors.textSubtle }]}>
            格式: http://IP地址:端口号
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surfaceMuted,
                color: theme.colors.text,
                borderColor: theme.colors.border,
              },
            ]}
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="http://192.168.1.100:8000"
            placeholderTextColor={theme.colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.colors.primary }]}
              onPress={handleTest}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.buttonText}>测试连接</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.colors.success }]}
              onPress={handleSave}
            >
              <Text style={styles.buttonText}>保存</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.fullButton, { backgroundColor: theme.colors.primary }]}
            onPress={autoDiscover}
            disabled={isAutoDiscovering}
          >
            {isAutoDiscovering ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>自动发现后端</Text>
            )}
          </TouchableOpacity>

          {testResult ? (
            <Text
              style={[
                styles.testResult,
                { color: testResult.success ? theme.colors.success : theme.colors.danger },
              ]}
            >
              {testResult.message}
            </Text>
          ) : null}
        </View>

        <View style={[styles.section, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>可能的后端地址</Text>
          <Text style={[styles.hint, { color: theme.colors.textSubtle }]}>
            点击选择以下地址进行测试：
          </Text>
          {possibleUrls.map((url, index) => (
            <TouchableOpacity
              key={url}
              style={[
                styles.urlItem,
                { borderBottomColor: theme.colors.border },
                index === possibleUrls.length - 1 && styles.urlItemLast,
              ]}
              onPress={() => setInputUrl(url)}
            >
              <Text style={[styles.urlText, { color: theme.colors.text }]}>{url}</Text>
              <Text style={[styles.urlArrow, { color: theme.colors.textSubtle }]}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.section, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>常见问题</Text>
          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: theme.colors.text }]}>
              如何找到正确的后端地址？
            </Text>
            <Text style={[styles.faqAnswer, { color: theme.colors.textSubtle }]}>
              1. 确保后端服务已启动（uvicorn main:app --reload）{'\n'}
              2. 确保手机和电脑连接同一 WiFi{'\n'}
              3. 查看电脑的网络 IP 地址{'\n'}
              4. 格式: http://电脑IP:8000
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={[styles.resetText, { color: theme.colors.textSubtle }]}>恢复默认地址</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
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
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  currentUrl: {
    fontSize: 15,
    fontFamily: 'monospace',
  },
  deviceIp: {
    fontSize: 13,
    marginTop: 4,
  },
  hint: {
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'monospace',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullButton: {
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  testResult: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  urlItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  urlItemLast: {
    borderBottomWidth: 0,
  },
  urlText: {
    fontSize: 15,
    fontFamily: 'monospace',
  },
  urlArrow: {
    fontSize: 20,
  },
  faqItem: {
    marginTop: 8,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    lineHeight: 20,
  },
  resetButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  resetText: {
    fontSize: 15,
  },
});
