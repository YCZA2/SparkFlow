/**
 * 网络配置管理工具
 * 支持动态后端地址配置，自动检测局域网 IP
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Network from 'expo-network';

const STORAGE_KEY = '@backend_url';
const DEFAULT_PORT = '8000';

// 常见的局域网 IP 段
const COMMON_IP_PREFIXES = ['192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.'];

/**
 * 获取设备当前的 IP 地址
 */
export async function getDeviceIpAddress(): Promise<string | null> {
  try {
    const ip = await Network.getIpAddressAsync();
    return ip;
  } catch (error) {
    console.error('获取设备 IP 失败:', error);
    return null;
  }
}

/**
 * 根据设备 IP 推断后端可能的地址
 */
export async function inferBackendUrl(): Promise<string[]> {
  const possibleUrls: string[] = [];

  // 添加默认开发地址
  if (Platform.OS === 'ios') {
    // iOS 模拟器
    possibleUrls.push('http://localhost:8000');
  } else if (Platform.OS === 'android') {
    // Android 模拟器
    possibleUrls.push('http://10.0.2.2:8000');
  }

  // 获取设备 IP，推断同网段后端地址
  const deviceIp = await getDeviceIpAddress();
  if (deviceIp) {
    // 提取网段前缀
    const ipParts = deviceIp.split('.');
    if (ipParts.length === 4) {
      const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
      // 常见的后端地址（.1 是路由器，.100+ 是电脑）
      possibleUrls.push(`http://${subnet}.2:8000`);
      possibleUrls.push(`http://${subnet}.100:8000`);
      possibleUrls.push(`http://${subnet}.101:8000`);
      possibleUrls.push(`http://${subnet}.157:8000`); // 原配置
    }
  }

  // 添加常用的局域网地址
  possibleUrls.push('http://192.168.31.157:8000');
  possibleUrls.push('http://192.168.1.100:8000');
  possibleUrls.push('http://192.168.0.100:8000');

  return [...new Set(possibleUrls)]; // 去重
}

/**
 * 测试后端地址是否可用
 */
export async function testBackendUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 秒超时

    const response = await fetch(`${url}/`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 自动发现可用的后端地址
 */
export async function discoverBackendUrl(): Promise<string | null> {
  const possibleUrls = await inferBackendUrl();

  for (const url of possibleUrls) {
    console.log(`[Network] 测试后端地址: ${url}`);
    const isAvailable = await testBackendUrl(url);
    if (isAvailable) {
      console.log(`[Network] 发现可用后端: ${url}`);
      return url;
    }
  }

  return null;
}

/**
 * 获取当前配置的后端地址
 */
export async function getBackendUrl(): Promise<string> {
  try {
    // 先从本地存储读取
    const storedUrl = await AsyncStorage.getItem(STORAGE_KEY);
    if (storedUrl) {
      return storedUrl;
    }
  } catch (error) {
    console.error('读取后端地址失败:', error);
  }

  // 默认地址
  return 'http://192.168.31.157:8000';
}

/**
 * 设置后端地址
 */
export async function setBackendUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, url);
  } catch (error) {
    console.error('保存后端地址失败:', error);
    throw error;
  }
}

/**
 * 清除后端地址配置（恢复默认）
 */
export async function clearBackendUrl(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('清除后端地址失败:', error);
  }
}

/**
 * 获取网络诊断信息
 */
export async function getNetworkDiagnostics(): Promise<{
  deviceIp: string | null;
  currentBackendUrl: string;
  isBackendAvailable: boolean;
  possibleUrls: string[];
}> {
  const deviceIp = await getDeviceIpAddress();
  const currentBackendUrl = await getBackendUrl();
  const isBackendAvailable = await testBackendUrl(currentBackendUrl);
  const possibleUrls = await inferBackendUrl();

  return {
    deviceIp,
    currentBackendUrl,
    isBackendAvailable,
    possibleUrls,
  };
}
