/**
 * Auth 状态管理 Store
 * 使用 Zustand 管理认证状态，复用 api.ts 中的工具函数
 */

import { create } from 'zustand';

import {
  fetchCurrentUser,
  getUserInfo,
  hydrateAuthenticatedWorkspace,
  loginWithEmail as loginWithEmailApi,
  registerWithEmail as registerWithEmailApi,
  logout as logoutApi,
  parseUserFromToken,
  type UserInfo,
} from '@/features/auth/api';
import { getDeviceSessionInvalidReason } from '@/features/auth/deviceSession';
import { activateUserWorkspace } from '@/features/auth/workspace';
import { getToken } from '@/features/core/api/client';
import { getErrorMessage } from '@/utils/error';

export interface AuthState {
  user: UserInfo | null;
  isReady: boolean;
  isAuthenticated: boolean;
  error: string | null;
  sessionStatus: 'anonymous' | 'authenticated' | 'expired';
}

export interface AuthActions {
  setUser: (user: UserInfo | null) => void;
  setReady: (ready: boolean) => void;
  setError: (error: string | null) => void;
  registerWithEmail: (email: string, password: string, nickname?: string) => Promise<UserInfo>;
  loginWithEmail: (email: string, password: string) => Promise<UserInfo>;
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
  sessionStatus: 'anonymous',

  /*操作*/
  setUser: (user) => {
    set({
      user,
      isAuthenticated: !!user,
      error: null,
      sessionStatus: user ? 'authenticated' : 'anonymous',
    });
  },

  setReady: (ready) => {
    set({ isReady: ready });
  },

  setError: (error) => {
    set({ error });
  },

  registerWithEmail: async (email, password, nickname) => {
    try {
      const user = await registerWithEmailApi(email, password, nickname);
      set({ user, isAuthenticated: true, error: null, sessionStatus: 'authenticated' });
      return user;
    } catch (err) {
      const error = getErrorMessage(err, '注册失败');
      set({ error, sessionStatus: 'anonymous' });
      throw err;
    }
  },

  loginWithEmail: async (email, password) => {
    try {
      const user = await loginWithEmailApi(email, password);
      set({ user, isAuthenticated: true, error: null, sessionStatus: 'authenticated' });
      return user;
    } catch (err) {
      const error = getErrorMessage(err, '登录失败');
      set({ error, sessionStatus: 'anonymous' });
      throw err;
    }
  },

  logout: async () => {
    await logoutApi();
    set({ user: null, isAuthenticated: false, error: null, sessionStatus: 'anonymous' });
  },

  refreshUserInfo: async () => {
    const token = await getToken();
    if (!token) {
      set({ user: null, isAuthenticated: false, sessionStatus: 'anonymous' });
      return;
    }

    const remoteUser = await fetchCurrentUser();
    const user = { ...parseUserFromToken(token), ...remoteUser };
    set({ user, isAuthenticated: true, sessionStatus: 'authenticated' });
  },

  bootstrap: async () => {
    try {
      set({ error: null });
      const token = await getToken();

      if (token) {
        /*优先校验并恢复正式登录态，再挂载当前账号工作区。 */
        const storedUser = await getUserInfo();
        let user = storedUser;
        try {
          user = (await hydrateAuthenticatedWorkspace()) ?? storedUser;
        } catch (err) {
          if (!storedUser) {
            throw err;
          }
          await activateUserWorkspace(storedUser.user_id);
        }
        if (!user) {
          set({ user: null, isAuthenticated: false, isReady: true, sessionStatus: 'anonymous' });
          return;
        }
        set({ user, isAuthenticated: true, isReady: true, sessionStatus: 'authenticated' });
      } else {
        const invalidReason = await getDeviceSessionInvalidReason();
        if (invalidReason) {
          /*设备会话失效后直接回到登录态，并提示用户重新登录。 */
          set({
            user: null,
            isAuthenticated: false,
            error: invalidReason,
            isReady: true,
            sessionStatus: 'expired',
          });
          return;
        }
        set({ user: null, isAuthenticated: false, isReady: true, sessionStatus: 'anonymous' });
      }
    } catch (err) {
      const error = getErrorMessage(err, '初始化失败');
      set({ user: null, isAuthenticated: false, error, isReady: true, sessionStatus: 'expired' });
    }
  },
}));

/*选择器 hooks*/
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useIsReady = () => useAuthStore((state) => state.isReady);
export const useAuthError = () => useAuthStore((state) => state.error);
