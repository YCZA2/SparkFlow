/**
 * Auth 状态管理 Store
 * 使用 Zustand 管理认证状态，复用 api.ts 中的工具函数
 */

import { create } from 'zustand';

import {
  getUserInfo,
  loginWithTestUser as loginWithTestUserApi,
  logout as logoutApi,
  parseUserFromToken,
  type UserInfo,
} from '@/features/auth/api';
import { getToken } from '@/features/core/api/client';

export interface AuthState {
  user: UserInfo | null;
  isReady: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export interface AuthActions {
  setUser: (user: UserInfo | null) => void;
  setReady: (ready: boolean) => void;
  setError: (error: string | null) => void;
  loginWithTestUser: () => Promise<UserInfo>;
  logout: () => Promise<void>;
  refreshUserInfo: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()((set, get) => ({
  /*初始状态*/
  user: null,
  isReady: false,
  isAuthenticated: false,
  error: null,

  /*操作*/
  setUser: (user) => {
    set({ user, isAuthenticated: !!user, error: null });
  },

  setReady: (ready) => {
    set({ isReady: ready });
  },

  setError: (error) => {
    set({ error });
  },

  loginWithTestUser: async () => {
    try {
      const user = await loginWithTestUserApi();
      set({ user, isAuthenticated: true, error: null });
      return user;
    } catch (err) {
      const error = err instanceof Error ? err.message : '登录失败';
      set({ error });
      throw err;
    }
  },

  logout: async () => {
    await logoutApi();
    set({ user: null, isAuthenticated: false, error: null });
  },

  refreshUserInfo: async () => {
    const token = await getToken();
    if (!token) {
      set({ user: null, isAuthenticated: false });
      return;
    }

    const user = parseUserFromToken(token);
    set({ user, isAuthenticated: true });
  },

  bootstrap: async () => {
    try {
      set({ error: null });
      const token = await getToken();

      if (token) {
        /*优先从 AsyncStorage 恢复用户信息，避免重复解析 token*/
        const storedUser = await getUserInfo();
        if (storedUser) {
          set({ user: storedUser, isAuthenticated: true, isReady: true });
        } else {
          const user = parseUserFromToken(token);
          set({ user, isAuthenticated: true, isReady: true });
        }
      } else {
        /*无 token，自动使用测试用户登录*/
        const user = await get().loginWithTestUser();
        set({ user, isAuthenticated: true, isReady: true });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : '初始化失败';
      set({ user: null, isAuthenticated: false, error, isReady: true });
    }
  },
}));

/*选择器 hooks*/
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useIsReady = () => useAuthStore((state) => state.isReady);
export const useAuthError = () => useAuthStore((state) => state.error);