import React, { useEffect } from 'react';
import { AppState } from 'react-native';

import { initApiBaseUrl } from '@/constants/config';
import { useAuthStore } from '@/features/auth/authStore';
import {
  restoreLocalFragmentSyncQueue,
  restoreRemoteFragmentBodySyncQueue,
  wakeLocalFragmentSyncQueue,
  wakeRemoteFragmentBodySyncQueue,
} from '@/features/fragments/localFragmentSyncQueue';
import { ensureFragmentStoreReady } from '@/features/fragments/store';

/**
 * App Session Provider
 * 负责：
 * 1. 初始化本地镜像
 * 2. 初始化 API 基础 URL
 * 3. 启动时恢复同步队列
 * 4. 前后台切换时唤醒同步队列
 *
 * 认证状态由 useAuthStore 管理，无需 Context
 */
export function AppSessionProvider({ children }: { children: React.ReactNode }) {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isReady = useAuthStore((state) => state.isReady);

  useEffect(() => {
    /*启动时初始化本地镜像、API URL、认证态，并恢复同步队列。*/
    const init = async () => {
      await ensureFragmentStoreReady();
      await initApiBaseUrl();
      await bootstrap();

      /*恢复本地草稿同步队列，保证离线编辑可在后续静默收敛。*/
      await restoreLocalFragmentSyncQueue();
      await restoreRemoteFragmentBodySyncQueue();
    };

    void init();
  }, [bootstrap]);

  useEffect(() => {
    /*前后台切换时主动唤醒同步队列，避免正文草稿长期停留本地。*/
    const subscription = AppState.addEventListener('change', (nextState) => {
      /*仅在 background 和 active 状态时唤醒，减少冗余调用*/
      if (nextState === 'background' || nextState === 'active') {
        void wakeLocalFragmentSyncQueue().catch(() => undefined);
        void wakeRemoteFragmentBodySyncQueue().catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  if (!isReady) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Hook to access auth state
 * 直接使用 Zustand Store，无需 Context
 */
export function useAppSession() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isReady = useAuthStore((state) => state.isReady);
  const error = useAuthStore((state) => state.error);
  const loginWithTestUser = useAuthStore((state) => state.loginWithTestUser);
  const logout = useAuthStore((state) => state.logout);
  const refreshUserInfo = useAuthStore((state) => state.refreshUserInfo);

  return {
    isReady,
    isAuthenticated,
    user,
    error,
    loginWithTestUser,
    logout,
    refreshUserInfo,
  };
}
