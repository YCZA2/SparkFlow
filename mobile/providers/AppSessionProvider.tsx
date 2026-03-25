import React, { useEffect } from 'react';
import { AppState } from 'react-native';

import { initApiBaseUrl } from '@/constants/config';
import { getOrCreateDeviceId } from '@/features/auth/device';
import { subscribeAuthSessionLost } from '@/features/auth/sessionEvents';
import { useAuthStore } from '@/features/auth/authStore';
import { flushBackupQueue } from '@/features/backups/queue';
import { ensureFragmentStoreReady } from '@/features/fragments/store';
import { ensureScriptStoreReady } from '@/features/scripts/store';

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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    /*启动时只恢复设备标识、API 地址和登录态，不再自动补测试账号。*/
    const init = async () => {
      await getOrCreateDeviceId();
      await initApiBaseUrl();
      await bootstrap();
    };

    void init();
  }, [bootstrap]);

  useEffect(() => {
    /*任意请求触发远端会话失效时，立即把 UI 切回登录态。*/
    const unsubscribe = subscribeAuthSessionLost((reason) => {
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        error: reason || '登录已失效，请重新登录',
        sessionStatus: 'expired',
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    /*只有登录并挂载工作区后，才初始化本地真值和备份队列。*/
    const prepareWorkspace = async () => {
      if (!isAuthenticated || !user?.user_id) {
        return;
      }
      await ensureFragmentStoreReady();
      await ensureScriptStoreReady();
      await flushBackupQueue().catch(() => undefined);
    };
    void prepareWorkspace();
  }, [isAuthenticated, user?.user_id]);

  useEffect(() => {
    /*前后台切换时主动唤醒同步队列，避免正文草稿长期停留本地。*/
    const subscription = AppState.addEventListener('change', (nextState) => {
      /*仅在 background 和 active 状态时唤醒，减少冗余调用*/
      if (isAuthenticated && (nextState === 'background' || nextState === 'active')) {
        void flushBackupQueue().catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    /*在前台长时间使用时定期重试 failed 条目，补充前后台切换事件的覆盖盲区。*/
    const intervalId = setInterval(() => {
      if (isAuthenticated) {
        void flushBackupQueue().catch(() => undefined);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [isAuthenticated]);

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
  const sessionStatus = useAuthStore((state) => state.sessionStatus);
  const requestVerificationCode = useAuthStore((state) => state.requestVerificationCode);
  const loginWithPhoneCode = useAuthStore((state) => state.loginWithPhoneCode);
  const logout = useAuthStore((state) => state.logout);
  const refreshUserInfo = useAuthStore((state) => state.refreshUserInfo);

  return {
    isReady,
    isAuthenticated,
    user,
    error,
    sessionStatus,
    requestVerificationCode,
    loginWithPhoneCode,
    logout,
    refreshUserInfo,
  };
}
