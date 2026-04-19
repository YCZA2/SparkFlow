import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { ScreenState } from '@/components/ScreenState';
import { Text } from '@/components/Themed';
import { getDefaultApiBaseUrl, isDeveloperToolsEnabled } from '@/constants/appConfig';
import { useNetworkSettings } from '@/features/network/hooks';
import { useAppTheme } from '@/theme/useAppTheme';

export default function NetworkSettingsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const developerToolsEnabled = isDeveloperToolsEnabled();
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

  if (!developerToolsEnabled) {
    /*生产包命中调试路由时直接拒绝进入，避免深链绕过入口裁剪。 */
    return (
      <>
        <Stack.Screen options={{ title: '网络设置' }} />
        <View className="flex-1 bg-app-background dark:bg-app-background-dark">
          <ScreenState
            icon="🔒"
            title="当前环境不可用"
            message="正式环境已禁用网络设置，请返回工作区继续使用。"
            actionLabel="返回工作台"
            onAction={() => router.replace('/profile')}
          />
        </View>
      </>
    );
  }

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
    await resetToDefault(getDefaultApiBaseUrl());
    Alert.alert('重置成功', '已恢复默认地址');
  };

  return (
    <>
      <Stack.Screen options={{ title: '网络设置' }} />
      <ScrollView
        className="flex-1 bg-app-background dark:bg-app-background-dark"
        contentContainerClassName="p-sf-lg pb-10"
      >
        <View className="mb-sf-lg rounded-sf-md bg-app-surface p-sf-lg dark:bg-app-surface-dark" style={theme.shadow.card}>
          <Text className="mb-sf-md text-[17px] font-semibold text-app-text dark:text-app-text-dark">当前配置</Text>
          <Text className="font-mono text-[15px] text-app-text-subtle dark:text-app-text-subtle-dark">{currentUrl}</Text>
          {diagnostics?.deviceIp ? (
            <Text className="mt-sf-xs text-[13px] text-app-text-subtle dark:text-app-text-subtle-dark">
              本机 IP: {diagnostics.deviceIp}
            </Text>
          ) : null}
        </View>

        <View className="mb-sf-lg rounded-sf-md bg-app-surface p-sf-lg dark:bg-app-surface-dark" style={theme.shadow.card}>
          <Text className="mb-sf-md text-[17px] font-semibold text-app-text dark:text-app-text-dark">后端地址</Text>
          <Text className="mb-sf-sm text-[13px] text-app-text-subtle dark:text-app-text-subtle-dark">
            格式: http://IP地址:端口号
          </Text>
          <TextInput
            className="h-11 rounded-sf-sm border bg-app-surface-muted px-sf-md font-mono text-[15px] text-app-text dark:bg-app-surface-muted-dark dark:text-app-text-dark"
            style={{ borderColor: theme.colors.border }}
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="http://192.168.1.100:8000"
            placeholderTextColor={theme.colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View className="mt-sf-md flex-row gap-sf-md">
            <TouchableOpacity
              className="h-11 flex-1 items-center justify-center rounded-sf-sm"
              style={{ backgroundColor: theme.colors.primary }}
              onPress={handleTest}
              disabled={isTesting}
            >
              {isTesting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text className="text-[15px] font-semibold text-white">测试连接</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="h-11 flex-1 items-center justify-center rounded-sf-sm"
              style={{ backgroundColor: theme.colors.success }}
              onPress={handleSave}
            >
              <Text className="text-[15px] font-semibold text-white">保存</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className="mt-sf-sm h-11 items-center justify-center rounded-sf-sm"
            style={{ backgroundColor: theme.colors.primary }}
            onPress={autoDiscover}
            disabled={isAutoDiscovering}
          >
            {isAutoDiscovering ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text className="text-[15px] font-semibold text-white">自动发现后端</Text>
            )}
          </TouchableOpacity>

          {testResult ? (
            <Text
              className="mt-sf-md text-sm leading-5"
              style={{ color: testResult.success ? theme.colors.success : theme.colors.danger }}
            >
              {testResult.message}
            </Text>
          ) : null}
        </View>

        <View className="mb-sf-lg rounded-sf-md bg-app-surface p-sf-lg dark:bg-app-surface-dark" style={theme.shadow.card}>
          <Text className="mb-sf-md text-[17px] font-semibold text-app-text dark:text-app-text-dark">可能的后端地址</Text>
          <Text className="mb-sf-sm text-[13px] text-app-text-subtle dark:text-app-text-subtle-dark">
            点击选择以下地址进行测试：
          </Text>
          {possibleUrls.map((url, index) => (
            <TouchableOpacity
              key={url}
              className="flex-row items-center justify-between border-b py-sf-md"
              style={[
                { borderBottomColor: theme.colors.border },
                index === possibleUrls.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => setInputUrl(url)}
            >
              <Text className="font-mono text-[15px] text-app-text dark:text-app-text-dark">{url}</Text>
              <Text className="text-xl text-app-text-subtle dark:text-app-text-subtle-dark">›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="mb-sf-lg rounded-sf-md bg-app-surface p-sf-lg dark:bg-app-surface-dark" style={theme.shadow.card}>
          <Text className="mb-sf-md text-[17px] font-semibold text-app-text dark:text-app-text-dark">常见问题</Text>
          <View className="mt-sf-sm">
            <Text className="mb-sf-sm text-[15px] font-medium text-app-text dark:text-app-text-dark">
              如何找到正确的后端地址？
            </Text>
            <Text className="text-sm leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
              1. 确保后端服务已启动（uvicorn main:app --reload）{'\n'}
              2. 确保手机和电脑连接同一 WiFi{'\n'}
              3. 查看电脑的网络 IP 地址{'\n'}
              4. 格式: http://电脑IP:8000
            </Text>
          </View>
        </View>

        <TouchableOpacity className="items-center py-sf-lg" onPress={handleReset}>
          <Text className="text-[15px] text-app-text-subtle dark:text-app-text-subtle-dark">恢复默认地址</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}
