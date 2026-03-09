import { useEffect, useMemo, useState } from 'react';
import { getUserInfo, loginWithTestUser } from '@/features/auth/api';
import {
  ApiError,
  getCurrentBackendUrl,
  getToken,
  testConnection,
} from '@/features/core/api/client';
import {
  createFragment,
  deleteFragment,
  fetchFragmentDetail,
  fetchFragments,
} from '@/features/fragments/api';
import { getTranscribeStatus } from '@/features/recording/api';

export interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  data?: unknown;
}

const TEST_NAMES = [
  '1. 后端连接测试',
  '2. 认证服务测试',
  '3. 碎片列表获取',
  '4. 创建测试碎片',
  '5. 获取碎片详情',
  '6. 删除测试碎片',
  '7. 转写状态查询',
  '8. 音频上传测试',
  '9. 检查转写结果',
] as const;

function buildInitialTests(): TestResult[] {
  return TEST_NAMES.map((name) => ({ name, status: 'pending' as const }));
}

export function useApiTestSuite() {
  const [backendUrl, setBackendUrl] = useState('');
  const [tests, setTests] = useState<TestResult[]>(buildInitialTests);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [lastUploadedFragmentId] = useState<string | null>(null);
  const [lastCreatedFragmentId, setLastCreatedFragmentId] = useState<string | null>(null);

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
        await loginWithTestUser();
        token = await getToken();
      }
      const user = await getUserInfo();
      updateTest(1, 'success', `Token: ${token?.substring(0, 20)}...`, { user });
      return true;
    } catch (err) {
      updateTest(1, 'error', `错误: ${(err as Error).message}`);
      return false;
    }
  };

  const testFetchFragmentsCase = async () => {
    updateTest(2, 'running');
    try {
      const data = await fetchFragments();
      updateTest(2, 'success', `获取到 ${data.items?.length || 0} 条碎片`, data);
      return data.items || [];
    } catch (err) {
      if (err instanceof ApiError) {
        updateTest(2, 'error', `${err.code}: ${err.message}`);
      } else {
        updateTest(2, 'error', (err as Error).message);
      }
      return [];
    }
  };

  const testCreateFragmentCase = async () => {
    updateTest(3, 'running');
    try {
      const data = await createFragment({
        transcript: `[API测试] 测试碎片 - ${new Date().toLocaleString()}`,
        source: 'manual',
      });
      setLastCreatedFragmentId(data.id);
      updateTest(3, 'success', `创建成功: ${data.id.substring(0, 8)}...`, data);
      return data;
    } catch (err) {
      if (err instanceof ApiError) {
        updateTest(3, 'error', `${err.code}: ${err.message}`);
      } else {
        updateTest(3, 'error', (err as Error).message);
      }
      return null;
    }
  };

  const testFragmentDetailCase = async (fragmentId: string) => {
    updateTest(4, 'running');
    try {
      const data = await fetchFragmentDetail(fragmentId);
      updateTest(4, 'success', `详情获取成功: ${data.transcript?.substring(0, 30)}...`, data);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        updateTest(4, 'error', `${err.code}: ${err.message}`);
      } else {
        updateTest(4, 'error', (err as Error).message);
      }
      return false;
    }
  };

  const testDeleteFragmentCase = async (fragmentId: string) => {
    updateTest(5, 'running');
    try {
      await deleteFragment(fragmentId);
      updateTest(5, 'success', '删除成功');
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        updateTest(5, 'error', `${err.code}: ${err.message}`);
      } else {
        updateTest(5, 'error', (err as Error).message);
      }
      return false;
    }
  };

  const getTestFragmentId = async () => {
    if (lastCreatedFragmentId) {
      return lastCreatedFragmentId;
    }
    const fragments = await fetchFragments();
    return fragments.items?.[0]?.id ?? null;
  };

  const testFragmentDetailStandalone = async () => {
    try {
      const fragmentId = await getTestFragmentId();
      if (!fragmentId) {
        updateTest(4, 'error', '没有可用的碎片，请先创建碎片');
        return false;
      }
      return testFragmentDetailCase(fragmentId);
    } catch (err) {
      updateTest(4, 'error', (err as Error).message);
      return false;
    }
  };

  const testDeleteFragmentStandalone = async () => {
    updateTest(5, 'running');
    try {
      const created = await testCreateFragmentCase();
      if (created?.id) {
        await testDeleteFragmentCase(created.id);
      }
      return true;
    } catch (err) {
      updateTest(5, 'error', (err as Error).message);
      return false;
    }
  };

  const testTranscribeStatusCase = async () => {
    updateTest(6, 'running');
    try {
      const fragments = await fetchFragments();
      if (!fragments.items?.length) {
        updateTest(6, 'error', '没有可查询的碎片');
        return false;
      }
      const firstFragment = fragments.items[0];
      const data = await getTranscribeStatus(firstFragment.id);
      updateTest(6, 'success', data.transcript ? '已返回转写内容' : '已返回碎片详情', data);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        updateTest(6, 'error', `${err.code}: ${err.message}`);
      } else {
        updateTest(6, 'error', (err as Error).message);
      }
      return false;
    }
  };

  const testUploadAudioCase = async () => {
    updateTest(7, 'running');
    updateTest(7, 'error', '请在真机上测试：先使用录音功能录制音频，然后调用 uploadAudio(uri)');
    return false;
  };

  const testCheckUploadedTranscribeCase = async () => {
    updateTest(8, 'running');
    try {
      let targetId = lastUploadedFragmentId;
      if (!targetId) {
        const fragments = await fetchFragments();
        if (!fragments.items?.length) {
          updateTest(8, 'error', '没有可查询的碎片');
          return false;
        }
        const voiceFragment = fragments.items.find((fragment) => fragment.source === 'voice');
        if (!voiceFragment) {
          updateTest(8, 'error', '没有找到语音碎片');
          return false;
        }
        targetId = voiceFragment.id;
      }

      const data = await getTranscribeStatus(targetId);
      updateTest(
        8,
        'success',
        data.transcript ? '已拿到转写结果' : '任务尚未写入转写文本',
        { transcript: data.transcript?.substring(0, 50) }
      );
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        updateTest(8, 'error', `${err.code}: ${err.message}`);
      } else {
        updateTest(8, 'error', (err as Error).message);
      }
      return false;
    }
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

    await testFetchFragmentsCase();
    const created = await testCreateFragmentCase();
    if (created?.id) {
      await testFragmentDetailCase(created.id);
      await testDeleteFragmentCase(created.id);
    }
    await testTranscribeStatusCase();
    await testUploadAudioCase();
    await testCheckUploadedTranscribeCase();
    setIsRunningAll(false);
  };

  const actions = useMemo(
    () => [
      { label: '1. 测试连接', run: testConnectionCase },
      { label: '2. 测试认证', run: testAuthCase },
      { label: '3. 获取碎片', run: testFetchFragmentsCase },
      { label: '4. 创建碎片', run: testCreateFragmentCase },
      { label: '5. 碎片详情', run: testFragmentDetailStandalone },
      { label: '6. 删除碎片', run: testDeleteFragmentStandalone },
      { label: '7. 转写状态', run: testTranscribeStatusCase },
      { label: '8. 音频上传', run: testUploadAudioCase },
      { label: '9. 检查转写', run: testCheckUploadedTranscribeCase },
    ],
    [lastCreatedFragmentId]
  );

  return {
    backendUrl,
    tests,
    isRunningAll,
    runAllTests,
    actions,
  };
}
