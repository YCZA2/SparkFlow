/**
 * 认证状态管理 Hook
 * 管理用户登录状态、Token 获取和用户信息
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getToken,
  setToken,
  clearToken,
  fetchTestToken,
  ApiError,
} from '@/utils/api';
import { STORAGE_KEYS } from '@/constants/config';

// 用户信息类型
export interface UserInfo {
  user_id: string;
  role: string;
  nickname?: string;
}

// Auth 状态类型
interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: UserInfo | null;
  error: string | null;
}

/**
 * 认证管理 Hook
 * 提供登录状态管理和用户认证相关操作
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    error: null,
  });

  /**
   * 初始化认证状态
   * 检查本地是否有有效的 Token
   */
  const initAuth = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const token = await getToken();
      const userJson = await AsyncStorage.getItem(STORAGE_KEYS.USER);

      if (token && userJson) {
        const user = JSON.parse(userJson) as UserInfo;
        setState({
          isLoading: false,
          isAuthenticated: true,
          user,
          error: null,
        });
      } else {
        // 没有 Token，自动获取测试用户 Token
        await loginWithTestUser();
      }
    } catch (error) {
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error: '初始化认证失败: ' + (error as Error).message,
      });
    }
  }, []);

  /**
   * 使用测试用户登录
   * 自动调用后端 /api/auth/token 获取 Token
   */
  const loginWithTestUser = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const token = await fetchTestToken();

      // 解析 Token 获取用户信息（JWT payload）
      const payload = JSON.parse(atob(token.split('.')[1]));
      const user: UserInfo = {
        user_id: payload.sub || 'unknown',
        role: payload.role || 'user',
        nickname: '测试博主',
      };

      // 保存用户信息
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

      setState({
        isLoading: false,
        isAuthenticated: true,
        user,
        error: null,
      });

      return user;
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : (error as Error).message;
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error: '登录失败: ' + message,
      });
      throw error;
    }
  }, []);

  /**
   * 登出
   * 清除 Token 和用户信息
   */
  const logout = useCallback(async () => {
    await clearToken();
    await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      error: null,
    });
  }, []);

  /**
   * 刷新用户信息
   */
  const refreshUserInfo = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const payload = JSON.parse(atob(token.split('.')[1]));
      const user: UserInfo = {
        user_id: payload.sub || 'unknown',
        role: payload.role || 'user',
        nickname: '测试博主',
      };

      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      setState((prev) => ({ ...prev, user }));
    } catch (error) {
      console.error('刷新用户信息失败:', error);
    }
  }, []);

  // 组件挂载时初始化
  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return {
    ...state,
    loginWithTestUser,
    logout,
    refreshUserInfo,
    initAuth,
  };
}
