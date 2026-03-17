import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/constants/config';
import { clearToken, fetchTestToken, getToken, setToken } from '@/features/core/api/client';
import { getOrCreateDeviceId } from '@/features/auth/device';
import { clearDeviceSessionInvalid } from '@/features/auth/deviceSession';

export { clearToken, fetchTestToken, getToken, setToken };

export interface UserInfo {
  user_id: string;
  role: string;
  nickname?: string;
  device_id?: string;
  session_version?: number;
}

export function parseUserFromToken(token: string): UserInfo {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      user_id: payload.sub || 'unknown',
      role: payload.role || 'user',
      nickname: '测试博主',
      device_id: payload.device_id,
      session_version: payload.session_version,
    };
  } catch {
    return {
      user_id: 'unknown',
      role: 'user',
      nickname: '测试博主',
    };
  }
}

export async function saveUserInfo(user: UserInfo): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

export async function getUserInfo(): Promise<UserInfo | null> {
  const userJson = await AsyncStorage.getItem(STORAGE_KEYS.USER);
  if (!userJson) {
    return null;
  }
  return JSON.parse(userJson) as UserInfo;
}

export async function clearUserInfo(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.USER);
}

export async function loginWithTestUser(): Promise<UserInfo> {
  await getOrCreateDeviceId();
  const token = await fetchTestToken();
  const user = parseUserFromToken(token);
  await saveUserInfo(user);
  return user;
}

export async function logout(): Promise<void> {
  await clearToken();
  await clearDeviceSessionInvalid();
  await clearUserInfo();
}
