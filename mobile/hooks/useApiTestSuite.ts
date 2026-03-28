import { useEffect, useMemo, useState } from 'react';
import { getUserInfo } from '@/features/auth/api';
import {
  getCurrentBackendUrl,
  getToken,
  testConnection,
} from '@/features/core/api/client';

export interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  data?: unknown;
}

const TEST_NAMES = [
  '1. 后端连接测试',
  '2. 认证服务测试',
  '3. 音频上传测试',
] as const;

function buildInitialTests(): TestResult[] {
  return TEST_NAMES.map((name) => ({ name, status: 'pending' as const }));
}

export function useApiTestSuite() {
  const [backendUrl, setBackendUrl] = useState('');
  const [tests, setTests] = useState<TestResult[]>(buildInitialTests());
  const [isRunningAll, setIsRunningAll] = useState(false);

  useEffect(() => {
    getCurrentBackendUrl().then((url) => setBackendUrl(url));
  }, []);

  const updateTest = (index: number, status: TestResult['status'], message?: string, data?: unknown) => {
    setTests((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status, message, data };
      return next;
    });
  };

  const testConnectionCase = async () => {
    updateTest(0, 'running');
    try {
      const ok = await testConnection();
      updateTest(0, ok ? 'success' : 'error', ok ? '连接正常' : '连接失败');
      return ok;
    } catch (err) {
      updateTest(0, 'error', `错误: ${(err as Error).message}`);
      return false;
    }
  };

  const testAuthCase = async () => {
    updateTest(1, 'running');
    try {
      let token = await getToken();
      if (!token) {
        throw new Error('当前未登录，请先在登录页完成邮箱密码登录');
      }
      const user = await getUserInfo();
      updateTest(1, 'success', `Token: ${token?.substring(0, 20)}...`, { user });
      return true;
    } catch (err) {
      updateTest(1, 'error', `错误: ${(err as Error).message}`);
      return false;
    }
  };

  const testUploadAudioCase = async () => {
    updateTest(2, 'running');
    updateTest(2, 'error', '请在真机上测试：先使用录音功能录制音频，然后调用 uploadAudio(uri)');
    return false;
  };

  const runAllTests = async () => {
    setIsRunningAll(true);
    setTests(buildInitialTests());

    const connected = await testConnectionCase();
    if (!connected) {
      setIsRunningAll(false);
      return;
    }

    const authed = await testAuthCase();
    if (!authed) {
      setIsRunningAll(false);
      return;
    }

    await testUploadAudioCase();
    setIsRunningAll(false);
  };

  const actions = useMemo(
    () => [
      { label: '1. 测试连接', run: testConnectionCase },
      { label: '2. 测试认证', run: testAuthCase },
      { label: '3. 音频上传', run: testUploadAudioCase },
    ],
    []
  );

  return {
    backendUrl,
    tests,
    isRunningAll,
    runAllTests,
    actions,
  };
}
