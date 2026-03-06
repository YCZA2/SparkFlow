import { useEffect, useState } from 'react';
import {
  discoverBackendUrl,
  getBackendUrl,
  getNetworkDiagnostics,
  inferBackendUrl,
  setBackendUrl,
  testBackendUrl,
} from '@/features/network/api';

interface NetworkDiagnostics {
  deviceIp: string | null;
  isBackendAvailable: boolean;
}

export function useNetworkSettings() {
  const [currentUrl, setCurrentUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isAutoDiscovering, setIsAutoDiscovering] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [possibleUrls, setPossibleUrls] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<NetworkDiagnostics | null>(null);

  const loadCurrentConfig = async () => {
    const url = await getBackendUrl();
    setCurrentUrl(url);
    setInputUrl(url);

    const [urls, diag] = await Promise.all([inferBackendUrl(), getNetworkDiagnostics()]);
    setPossibleUrls(urls);
    setDiagnostics(diag);
  };

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const testCurrentUrl = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      return {
        success: false,
        message: '请输入后端地址',
      };
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const isAvailable = await testBackendUrl(trimmed);
      const result = {
        success: isAvailable,
        message: isAvailable
          ? '连接成功，后端服务正常运行。'
          : '连接失败，请检查地址或确认后端已启动。',
      };
      setTestResult(result);
      return result;
    } catch (err) {
      const result = {
        success: false,
        message: `测试出错: ${(err as Error).message}`,
      };
      setTestResult(result);
      return result;
    } finally {
      setIsTesting(false);
    }
  };

  const saveCurrentUrl = async () => {
    const trimmed = inputUrl.trim();
    await setBackendUrl(trimmed);
    setCurrentUrl(trimmed);
  };

  const autoDiscover = async () => {
    setIsAutoDiscovering(true);
    setTestResult(null);

    try {
      const discoveredUrl = await discoverBackendUrl();
      const result = discoveredUrl
        ? {
            success: true,
            message: `自动发现成功，找到可用后端: ${discoveredUrl}`,
          }
        : {
            success: false,
            message: '自动发现失败，请确认后端已启动且设备与电脑在同一 WiFi。',
          };

      if (discoveredUrl) {
        setInputUrl(discoveredUrl);
      }
      setTestResult(result);
      return result;
    } catch (err) {
      const result = {
        success: false,
        message: `自动发现出错: ${(err as Error).message}`,
      };
      setTestResult(result);
      return result;
    } finally {
      setIsAutoDiscovering(false);
    }
  };

  const resetToDefault = async (defaultUrl: string) => {
    setInputUrl(defaultUrl);
    await setBackendUrl(defaultUrl);
    setCurrentUrl(defaultUrl);
  };

  return {
    currentUrl,
    inputUrl,
    setInputUrl,
    isTesting,
    isAutoDiscovering,
    testResult,
    possibleUrls,
    diagnostics,
    loadCurrentConfig,
    testCurrentUrl,
    saveCurrentUrl,
    autoDiscover,
    resetToDefault,
  };
}
