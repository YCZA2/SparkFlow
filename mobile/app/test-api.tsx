/**
 * API 服务测试页面
 * 验证新的 services/ 模块所有 API 是否正常工作
 */

import { useEffect, useState } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import {
  // 客户端测试
  testConnection,
  getCurrentBackendUrl,
  ApiError,
  // 认证服务
  getToken,
  loginWithTestUser,
  getUserInfo,
  // 碎片服务
  fetchFragments,
  fetchFragmentDetail,
  createFragment,
  deleteFragment,
  // 转写服务
  getTranscribeStatus,
} from '@/services';

// 测试状态类型
interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  data?: any;
}

export default function ApiTestScreen() {
  const [backendUrl, setBackendUrl] = useState<string>('');
  const [tests, setTests] = useState<TestResult[]>([
    { name: '1. 后端连接测试', status: 'pending' },
    { name: '2. 认证服务测试', status: 'pending' },
    { name: '3. 碎片列表获取', status: 'pending' },
    { name: '4. 创建测试碎片', status: 'pending' },
    { name: '5. 获取碎片详情', status: 'pending' },
    { name: '6. 删除测试碎片', status: 'pending' },
    { name: '7. 转写状态查询', status: 'pending' },
  ]);
  const [isRunningAll, setIsRunningAll] = useState(false);

  // 获取后端地址
  useEffect(() => {
    getCurrentBackendUrl().then(url => setBackendUrl(url));
  }, []);

  // 更新测试状态
  const updateTest = (index: number, status: TestResult['status'], message?: string, data?: any) => {
    setTests(prev => {
      const newTests = [...prev];
      newTests[index] = { ...newTests[index], status, message, data };
      return newTests;
    });
  };

  // 测试 1: 后端连接
  const testConnection_api = async () => {
    updateTest(0, 'running');
    try {
      const ok = await testConnection();
      updateTest(0, ok ? 'success' : 'error', ok ? '连接正常' : '连接失败');
      return ok;
    } catch (error) {
      updateTest(0, 'error', `错误: ${(error as Error).message}`);
      return false;
    }
  };

  // 测试 2: 认证服务
  const testAuth = async () => {
    updateTest(1, 'running');
    try {
      // 先检查是否有 Token
      let token = await getToken();
      if (!token) {
        await loginWithTestUser();
        token = await getToken();
      }
      const user = await getUserInfo();
      updateTest(1, 'success', `Token: ${token?.substring(0, 20)}...`, { user });
      return true;
    } catch (error) {
      updateTest(1, 'error', `错误: ${(error as Error).message}`);
      return false;
    }
  };

  // 测试 3: 碎片列表
  const testFetchFragments = async () => {
    updateTest(2, 'running');
    try {
      const data = await fetchFragments();
      updateTest(2, 'success', `获取到 ${data.items?.length || 0} 条碎片`, data);
      return data.items || [];
    } catch (error) {
      if (error instanceof ApiError) {
        updateTest(2, 'error', `${error.code}: ${error.message}`);
      } else {
        updateTest(2, 'error', (error as Error).message);
      }
      return [];
    }
  };

  // 测试 4: 创建碎片
  const testCreateFragment = async () => {
    updateTest(3, 'running');
    try {
      const data = await createFragment({
        transcript: `[API测试] 测试碎片 - ${new Date().toLocaleString()}`,
        source: 'manual',
      });
      updateTest(3, 'success', `创建成功: ${data.id.substring(0, 8)}...`, data);
      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        updateTest(3, 'error', `${error.code}: ${error.message}`);
      } else {
        updateTest(3, 'error', (error as Error).message);
      }
      return null;
    }
  };

  // 测试 5: 获取碎片详情
  const testFragmentDetail = async (fragmentId: string) => {
    updateTest(4, 'running');
    try {
      const data = await fetchFragmentDetail(fragmentId);
      updateTest(4, 'success', `详情获取成功: ${data.transcript?.substring(0, 30)}...`, data);
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        updateTest(4, 'error', `${error.code}: ${error.message}`);
      } else {
        updateTest(4, 'error', (error as Error).message);
      }
      return false;
    }
  };

  // 测试 6: 删除碎片
  const testDeleteFragment = async (fragmentId: string) => {
    updateTest(5, 'running');
    try {
      await deleteFragment(fragmentId);
      updateTest(5, 'success', '删除成功');
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        updateTest(5, 'error', `${error.code}: ${error.message}`);
      } else {
        updateTest(5, 'error', (error as Error).message);
      }
      return false;
    }
  };

  // 测试 7: 转写状态查询（使用第一个碎片）
  const testTranscribeStatus = async () => {
    updateTest(6, 'running');
    try {
      // 先获取碎片列表
      const fragments = await fetchFragments();
      if (!fragments.items || fragments.items.length === 0) {
        updateTest(6, 'error', '没有可查询的碎片');
        return false;
      }

      const firstFragment = fragments.items[0];
      const data = await getTranscribeStatus(firstFragment.id);
      updateTest(6, 'success', `状态: ${data.sync_status}`, data);
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        updateTest(6, 'error', `${error.code}: ${error.message}`);
      } else {
        updateTest(6, 'error', (error as Error).message);
      }
      return false;
    }
  };

  // 运行所有测试
  const runAllTests = async () => {
    setIsRunningAll(true);

    // 重置所有状态
    tests.forEach((_, i) => updateTest(i, 'pending'));

    // 1. 测试连接
    const connected = await testConnection_api();
    if (!connected) {
      setIsRunningAll(false);
      return;
    }

    // 2. 测试认证
    const authed = await testAuth();
    if (!authed) {
      setIsRunningAll(false);
      return;
    }

    // 3. 测试碎片列表
    await testFetchFragments();

    // 4. 测试创建碎片
    const created = await testCreateFragment();

    // 5. 测试碎片详情（使用刚创建的）
    if (created?.id) {
      await testFragmentDetail(created.id);

      // 6. 测试删除碎片
      await testDeleteFragment(created.id);
    }

    // 7. 测试转写状态
    await testTranscribeStatus();

    setIsRunningAll(false);
  };

  // 获取状态样式
  const getStatusStyle = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return styles.statusSuccess;
      case 'error':
        return styles.statusError;
      case 'running':
        return styles.statusRunning;
      default:
        return styles.statusPending;
    }
  };

  // 获取状态图标
  const getStatusIcon = (status: TestResult['status']) => {
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
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>API 服务测试</Text>
      <Text style={styles.subtitle}>验证 services/ 模块所有 API</Text>

      {/* 后端地址 */}
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>后端地址:</Text>
        <Text style={styles.infoValue}>{backendUrl || '加载中...'}</Text>
      </View>

      {/* 运行全部按钮 */}
      <TouchableOpacity
        style={[styles.runAllButton, isRunningAll && styles.buttonDisabled]}
        onPress={runAllTests}
        disabled={isRunningAll}
      >
        {isRunningAll ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.runAllButtonText}>🚀 运行全部测试</Text>
        )}
      </TouchableOpacity>

      {/* 测试结果列表 */}
      <View style={styles.testList}>
        {tests.map((test, index) => (
          <View key={index} style={styles.testCard}>
            <View style={styles.testHeader}>
              <Text style={styles.testIcon}>{getStatusIcon(test.status)}</Text>
              <Text style={[styles.testName, getStatusStyle(test.status)]}>
                {test.name}
              </Text>
              {test.status === 'running' && <ActivityIndicator size="small" style={styles.runningIndicator} />}
            </View>

            {test.message && (
              <Text style={styles.testMessage}>{test.message}</Text>
            )}

            {test.data && (
                <Text style={styles.testData}>
                  {JSON.stringify(test.data, null, 2).substring(0, 200)}
                  {JSON.stringify(test.data, null, 2).length > 200 ? '...' : ''}
                </Text>
              )}
          </View>
        ))}
      </View>

      {/* 单项测试按钮 */}
      <Text style={styles.sectionTitle}>单项测试</Text>
      <View style={styles.singleTestButtons}>
        <TouchableOpacity style={styles.singleTestBtn} onPress={testConnection_api}>
          <Text style={styles.singleTestBtnText}>测试连接</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.singleTestBtn} onPress={testAuth}>
          <Text style={styles.singleTestBtnText}>测试认证</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.singleTestBtn} onPress={() => testFetchFragments()}>
          <Text style={styles.singleTestBtnText}>获取碎片</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.singleTestBtn} onPress={testCreateFragment}>
          <Text style={styles.singleTestBtnText}>创建碎片</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  runAllButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  runAllButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  testList: {
    gap: 12,
  },
  testCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  testIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  testName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  statusSuccess: {
    color: '#34C759',
  },
  statusError: {
    color: '#FF3B30',
  },
  statusRunning: {
    color: '#007AFF',
  },
  statusPending: {
    color: '#999',
  },
  runningIndicator: {
    marginLeft: 8,
  },
  testMessage: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    paddingLeft: 28,
  },
  testData: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    paddingLeft: 28,
    fontFamily: 'monospace',
    backgroundColor: '#f8f8f8',
    padding: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
    color: '#333',
  },
  singleTestButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  singleTestBtn: {
    backgroundColor: '#34C759',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  singleTestBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
