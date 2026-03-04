/**
 * 认证服务模块
 * 提供 Token 管理、用户认证等功能
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/config';
import {
  getToken,
  setToken,
  clearToken,
  fetchTestToken,
} from './client';

// 重新导出 Token 管理函数
export { getToken, setToken, clearToken, fetchTestToken };

/**
 * 用户信息类型
 */
export interface UserInfo {
  /** 用户 ID */
  user_id: string;
  /** 用户角色 */
  role: string;
  /** 用户昵称 */
  nickname?: string;
}

/**
 * 从 Token 解析用户信息
 * @param token JWT Token
 * @returns 用户信息对象
 */
export function parseUserFromToken(token: string): UserInfo {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      user_id: payload.sub || 'unknown',
      role: payload.role || 'user',
      nickname: '测试博主',
    };
  } catch {
    return {
      user_id: 'unknown',
      role: 'user',
      nickname: '测试博主',
    };
  }
}

/**
 * 保存用户信息到本地存储
 * @param user 用户信息
 */
export async function saveUserInfo(user: UserInfo): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

/**
 * 从本地存储获取用户信息
 * @returns 用户信息或 null
 */
export async function getUserInfo(): Promise<UserInfo | null> {
  const userJson = await AsyncStorage.getItem(STORAGE_KEYS.USER);
  if (userJson) {
    return JSON.parse(userJson) as UserInfo;
  }
  return null;
}

/**
 * 清除用户信息
 */
export async function clearUserInfo(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.USER);
}

/**
 * 使用测试用户登录
 * 自动获取 Token 并保存用户信息
 * @returns 用户信息
 */
export async function loginWithTestUser(): Promise<UserInfo> {
  const token = await fetchTestToken();
  const user = parseUserFromToken(token);
  await saveUserInfo(user);
  return user;
}

/**
 * 登出
 * 清除 Token 和用户信息
 */
export async function logout(): Promise<void> {
  await clearToken();
  await clearUserInfo();
}
