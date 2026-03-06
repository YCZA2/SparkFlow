/**
 * 网络设置页面
 * 用于配置后端地址和诊断网络连接问题
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from 'react-native';
import { Text } from '@/components/Themed';
import { Stack, useRouter } from 'expo-router';
import {
  getBackendUrl,
  setBackendUrl,
  discoverBackendUrl,
  testBackendUrl,
  inferBackendUrl,
  getNetworkDiagnostics,
} from '@/utils/networkConfig';

/**
 * 网络设置页面
 */
export default function NetworkSettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [currentUrl, setCurrentUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoDiscovering, setIsAutoDiscovering] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [possibleUrls, setPossibleUrls] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<{
    deviceIp: string | null;
    isBackendAvailable: boolean;
  } | null>(null);

  // 加载当前配置
  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    const url = await getBackendUrl();
    setCurrentUrl(url);
    setInputUrl(url);

    // 获取可能的地址列表
    const urls = await inferBackendUrl();
    setPossibleUrls(urls);

    // 获取诊断信息
    const diag = await getNetworkDiagnostics();
    setDiagnostics(diag);
  };

  // 测试当前输入的地址
  const handleTest = async () => {
    if (!inputUrl.trim()) {
      Alert.alert('错误', '请输入后端地址');
      return;
    }

    setIsLoading(true);
    setTestResult(null);

    try {
      const isAvailable = await testBackendUrl(inputUrl.trim());
      setTestResult({
        success: isAvailable,
        message: isAvailable
          ? '✅ 连接成功！后端服务正常运行。'
          : '❌ 连接失败。请检查地址是否正确，后端服务是否已启动。',
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: '❌ 测试出错: ' + (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 保存配置
  const handleSave = async () => {
    if (!inputUrl.trim()) {
      Alert.alert('错误', '请输入后端地址');
      return;
    }

    try {
      await setBackendUrl(inputUrl.trim());
      setCurrentUrl(inputUrl.trim());
      Alert.alert(
        '保存成功',
        '后端地址已更新为: ' + inputUrl.trim(),
        [
          {
            text: '确定',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      Alert.alert('保存失败', (error as Error).message);
    }
  };

  // 自动发现后端
  const handleAutoDiscover = async () => {
    setIsAutoDiscovering(true);
    setTestResult(null);

    try {
      const discoveredUrl = await discoverBackendUrl();
      if (discoveredUrl) {
        setInputUrl(discoveredUrl);
        setTestResult({
          success: true,
          message: `✅ 自动发现成功！找到可用后端: ${discoveredUrl}`,
        });
      } else {
        setTestResult({
          success: false,
          message: '❌ 自动发现失败。未找到可用的后端服务。\n\n请确保：\n1. 后端服务已启动\n2. 手机和电脑在同一 WiFi 网络',
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: '❌ 自动发现出错: ' + (error as Error).message,
      });
    } finally {
      setIsAutoDiscovering(false);
    }
  };

  // 选择预设地址
  const handleSelectUrl = (url: string) => {
    setInputUrl(url);
  };

  // 重置为默认
  const handleReset = async () => {
    const defaultUrl = 'http://192.168.31.157:8000';
    setInputUrl(defaultUrl);
    await setBackendUrl(defaultUrl);
    setCurrentUrl(defaultUrl);
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
        style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F2F2F7' }]}
        contentContainerStyle={styles.content}
      >
        {/* 当前配置 */}
        <View style={[styles.section, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
            当前配置
          </Text>
          <Text style={[styles.currentUrl, { color: isDark ? '#8E8E93' : '#666666' }]}>
            {currentUrl}
          </Text>
          {diagnostics?.deviceIp && (
            <Text style={[styles.deviceIp, { color: isDark ? '#8E8E93' : '#999999' }]}>
              本机 IP: {diagnostics.deviceIp}
            </Text>
          )}
        </View>

        {/* 地址输入 */}
        <View style={[styles.section, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
            后端地址
          </Text>
          <Text style={[styles.hint, { color: isDark ? '#8E8E93' : '#666666' }]}>
            格式: http://IP地址:端口号
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7',
                color: isDark ? '#FFFFFF' : '#000000',
                borderColor: isDark ? '#3A3A3C' : '#E5E5EA',
              },
            ]}
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="http://192.168.1.100:8000"
            placeholderTextColor={isDark ? '#8E8E93' : '#999999'}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* 按钮组 */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.testButton]}
              onPress={handleTest}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.buttonText}>测试连接</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
            >
              <Text style={styles.buttonText}>保存</Text>
            </TouchableOpacity>
          </View>

          {/* 自动发现按钮 */}
          <TouchableOpacity
            style={[styles.button, styles.discoverButton, { marginTop: 8 }]}
            onPress={handleAutoDiscover}
            disabled={isAutoDiscovering}
          >
            {isAutoDiscovering ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>🔍 自动发现后端</Text>
            )}
          </TouchableOpacity>

          {/* 测试结果 */}
          {testResult && (
            <Text
              style={[
                styles.testResult,
                { color: testResult.success ? '#34C759' : '#FF3B30' },
              ]}
            >
              {testResult.message}
            </Text>
          )}
        </View>

        {/* 预设地址 */}
        <View style={[styles.section, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
            可能的后端地址
          </Text>
          <Text style={[styles.hint, { color: isDark ? '#8E8E93' : '#666666' }]}>
            点击选择以下地址进行测试：
          </Text>
          {possibleUrls.map((url, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.urlItem,
                { borderBottomColor: isDark ? '#3A3A3C' : '#E5E5EA' },
                index === possibleUrls.length - 1 && styles.urlItemLast,
              ]}
              onPress={() => handleSelectUrl(url)}
            >
              <Text style={[styles.urlText, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                {url}
              </Text>
              <Text style={[styles.urlArrow, { color: isDark ? '#8E8E93' : '#999999' }]}>
                ›
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 帮助信息 */}
        <View style={[styles.section, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
            常见问题
          </Text>
          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: isDark ? '#FFFFFF' : '#000000' }]}>
              如何找到正确的后端地址？
            </Text>
            <Text style={[styles.faqAnswer, { color: isDark ? '#8E8E93' : '#666666' }]}>
              1. 确保后端服务已启动（uvicorn main:app --reload）{'\n'}
              2. 确保手机和电脑连接同一 WiFi{'\n'}
              3. 查看电脑的网络 IP 地址{'\n'}
              4. 格式: http://电脑IP:8000
            </Text>
          </View>
        </View>

        {/* 重置按钮 */}
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={[styles.resetText, { color: isDark ? '#8E8E93' : '#999999' }]}>
            恢复默认地址
          </Text>
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
  testButton: {
    backgroundColor: '#007AFF',
  },
  saveButton: {
    backgroundColor: '#34C759',
  },
  discoverButton: {
    backgroundColor: '#5856D6',
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
