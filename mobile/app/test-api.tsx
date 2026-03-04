/**
 * API 测试页面
 * 用于验证阶段 4.2 的 API 请求工具模块
 */

import { useEffect, useState } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import { testConnection, get, post, del, ApiError } from '@/utils/api';
import { useAuth } from '@/hooks/useAuth';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// 碎片数据类型
interface Fragment {
  id: string;
  transcript: string;
  summary?: string;
  tags?: string;
  source: string;
  created_at: string;
}

function ApiTestContent() {
  const { isLoading: authLoading, isAuthenticated, user, error: authError } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<boolean | null>(null);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [loadingFragments, setLoadingFragments] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  // 测试后端连接
  const testBackendConnection = async () => {
    const ok = await testConnection();
    setConnectionStatus(ok);
  };

  // 获取碎片列表
  const fetchFragments = async () => {
    setLoadingFragments(true);
    setTestResult('');
    try {
      const data = await get<{ items: Fragment[]; total: number }>('/api/fragments/');
      setFragments(data.items);
      setTestResult(`✅ 获取成功！共 ${data.total} 条碎片`);
    } catch (error) {
      if (error instanceof ApiError) {
        setTestResult(`❌ 错误: ${error.code} - ${error.message}`);
      } else {
        setTestResult(`❌ 未知错误: ${(error as Error).message}`);
      }
    } finally {
      setLoadingFragments(false);
    }
  };

  // 创建测试碎片
  const createTestFragment = async () => {
    setTestResult('');
    try {
      const data = await post<Fragment>('/api/fragments/', {
        transcript: `测试碎片 - ${new Date().toLocaleString()}`,
        source: 'manual',
      });
      setTestResult(`✅ 创建成功！ID: ${data.id.substring(0, 8)}...`);
      // 刷新列表
      await fetchFragments();
    } catch (error) {
      if (error instanceof ApiError) {
        setTestResult(`❌ 错误: ${error.code} - ${error.message}`);
      } else {
        setTestResult(`❌ 未知错误: ${(error as Error).message}`);
      }
    }
  };

  // 删除碎片
  const deleteFragment = async (id: string) => {
    setTestResult('');
    try {
      await del(`/api/fragments/${id}`);
      setTestResult(`✅ 删除成功！`);
      // 刷新列表
      await fetchFragments();
    } catch (error) {
      if (error instanceof ApiError) {
        setTestResult(`❌ 错误: ${error.code} - ${error.message}`);
      } else {
        setTestResult(`❌ 未知错误: ${(error as Error).message}`);
      }
    }
  };

  // 初始测试连接
  useEffect(() => {
    testBackendConnection();
  }, []);

  // 认证完成后自动获取碎片列表
  useEffect(() => {
    if (isAuthenticated) {
      fetchFragments();
    }
  }, [isAuthenticated]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>API 测试页面</Text>
      <Text style={styles.subtitle}>阶段 4.2 验证</Text>

      {/* 连接状态 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. 后端连接状态</Text>
        <TouchableOpacity style={styles.button} onPress={testBackendConnection}>
          <Text style={styles.buttonText}>测试连接</Text>
        </TouchableOpacity>
        {connectionStatus !== null && (
          <Text style={[styles.status, connectionStatus ? styles.success : styles.error]}>
            {connectionStatus ? '✅ 后端连接正常' : '❌ 后端连接失败'}
          </Text>
        )}
      </View>

      {/* 认证状态 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. 认证状态</Text>
        {authLoading ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={styles.info}>已认证: {isAuthenticated ? '✅' : '❌'}</Text>
            {user && (
              <>
                <Text style={styles.info}>用户ID: {user.user_id}</Text>
                <Text style={styles.info}>角色: {user.role}</Text>
              </>
            )}
            {authError && <Text style={styles.error}>错误: {authError}</Text>}
          </>
        )}
      </View>

      {/* CRUD 测试 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. 碎片 API 测试</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={fetchFragments}>
            <Text style={styles.buttonText}>获取列表</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={createTestFragment}>
            <Text style={styles.buttonText}>创建测试</Text>
          </TouchableOpacity>
        </View>

        {testResult && (
          <Text style={[styles.status, testResult.startsWith('✅') ? styles.success : styles.error]}>
            {testResult}
          </Text>
        )}

        {loadingFragments ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <View style={styles.fragmentList}>
            <Text style={styles.listTitle}>碎片列表 ({fragments.length})</Text>
            {fragments.length === 0 ? (
              <Text style={styles.empty}>暂无碎片数据</Text>
            ) : (
              fragments.map((item) => (
                <View key={item.id} style={styles.fragmentCard}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.summary || item.transcript.substring(0, 30)}...
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => deleteFragment(item.id)}
                    >
                      <Text style={styles.deleteBtnText}>删除</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cardMeta}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

export default function ApiTestScreen() {
  return (
    <ErrorBoundary>
      <ApiTestContent />
    </ErrorBoundary>
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
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2f95dc',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  primaryButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  status: {
    marginTop: 12,
    fontSize: 14,
  },
  success: {
    color: '#34C759',
  },
  error: {
    color: '#FF3B30',
  },
  info: {
    fontSize: 14,
    marginBottom: 4,
  },
  loader: {
    marginTop: 16,
  },
  fragmentList: {
    marginTop: 16,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  empty: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  fragmentCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  cardMeta: {
    fontSize: 12,
    color: '#999',
  },
  deleteBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  deleteBtnText: {
    color: '#fff',
    fontSize: 12,
  },
});
