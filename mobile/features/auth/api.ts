import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_ENDPOINTS, STORAGE_KEYS } from '@/constants/config';
import { getOrCreateDeviceId } from '@/features/auth/device';
import { clearPersistedAuthState } from '@/features/auth/sessionPersistence';
import { activateUserWorkspace, clearUserWorkspace } from '@/features/auth/workspace';
import { clearDeviceSessionInvalid } from '@/features/auth/deviceSession';
import { fetchApi, clearToken, getToken, setToken } from '@/features/core/api/client';

export { clearToken, getToken, setToken };

export interface UserInfo {
  user_id: string;
  role: string;
  nickname?: string;
  email?: string;
  status?: string;
  device_id?: string;
  session_version?: number;
}

interface LoginResponsePayload {
  access_token: string;
  token_type: string;
  device_id: string;
  session_version: number;
  user: UserInfo;
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

export function parseUserFromToken(token: string): UserInfo {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      user_id: payload.sub || 'unknown',
      role: payload.role || 'user',
      device_id: payload.device_id,
      session_version: payload.session_version,
    };
  } catch {
    return {
      user_id: 'unknown',
      role: 'user',
    };
  }
}

export async function registerWithEmail(email: string, password: string, nickname?: string): Promise<UserInfo> {
  const deviceId = await getOrCreateDeviceId();
  const payload = await fetchApi<LoginResponsePayload>(
    API_ENDPOINTS.AUTH.REGISTER,
    'POST',
    {
      email,
      password,
      nickname,
      device_id: deviceId,
    },
    { requiresAuth: false }
  );
  await clearDeviceSessionInvalid();
  await setToken(payload.access_token);
  await activateUserWorkspace(payload.user.user_id);
  const user: UserInfo = {
    ...payload.user,
    device_id: payload.device_id,
    session_version: payload.session_version,
  };
  await saveUserInfo(user);
  return user;
}

export async function loginWithEmail(email: string, password: string): Promise<UserInfo> {
  const deviceId = await getOrCreateDeviceId();
  const payload = await fetchApi<LoginResponsePayload>(
    API_ENDPOINTS.AUTH.LOGIN,
    'POST',
    {
      email,
      password,
      device_id: deviceId,
    },
    { requiresAuth: false }
  );
  await clearDeviceSessionInvalid();
  await setToken(payload.access_token);
  await activateUserWorkspace(payload.user.user_id);
  const user: UserInfo = {
    ...payload.user,
    device_id: payload.device_id,
    session_version: payload.session_version,
  };
  await saveUserInfo(user);
  return user;
}

export async function fetchCurrentUser(): Promise<UserInfo> {
  return await fetchApi<UserInfo>(API_ENDPOINTS.AUTH.ME, 'GET');
}

export async function hydrateAuthenticatedWorkspace(): Promise<UserInfo | null> {
  const token = await getToken();
  if (!token) {
    await clearUserWorkspace();
    return null;
  }
  const remoteUser = await fetchCurrentUser();
  const user: UserInfo = {
    ...parseUserFromToken(token),
    ...remoteUser,
  };
  await activateUserWorkspace(user.user_id);
  await saveUserInfo(user);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await fetchApi<null>(API_ENDPOINTS.AUTH.LOGOUT, 'POST', undefined, { allowEmptyData: true });
  } catch {
    // 后端登出失败时仍要清掉本地会话，避免账号残留。
  }
  await clearPersistedAuthState();
}
