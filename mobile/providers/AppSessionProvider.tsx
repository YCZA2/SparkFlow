import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { initApiBaseUrl } from '@/constants/config';
import {
  getToken,
  getUserInfo,
  loginWithTestUser,
  logout as logoutService,
  parseUserFromToken,
  saveUserInfo,
  type UserInfo,
} from '@/features/auth/api';
import {
  restoreLocalFragmentSyncQueue,
  restoreRemoteFragmentBodySyncQueue,
  wakeLocalFragmentSyncQueue,
  wakeRemoteFragmentBodySyncQueue,
} from '@/features/fragments/localFragmentSyncQueue';
import { ensureFragmentLocalMirrorReady } from '@/features/fragments/store/localMirror';

interface AppSessionContextValue {
  isReady: boolean;
  isAuthenticated: boolean;
  user: UserInfo | null;
  error: string | null;
  loginWithTestUser: () => Promise<UserInfo>;
  logout: () => Promise<void>;
  refreshUserInfo: () => Promise<void>;
}

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

export function AppSessionProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshUserInfo = async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setIsAuthenticated(false);
      return;
    }

    const nextUser = parseUserFromToken(token);
    await saveUserInfo(nextUser);
    setUser(nextUser);
    setIsAuthenticated(true);
  };

  const bootstrap = async () => {
    /*启动时先准备本地镜像与认证态，避免 UI 抢先读取未迁移的数据层。 */
    try {
      setError(null);
      await ensureFragmentLocalMirrorReady();
      await initApiBaseUrl();
      const token = await getToken();
      const storedUser = await getUserInfo();

      if (token) {
        if (storedUser) {
          setUser(storedUser);
          setIsAuthenticated(true);
        } else {
          await refreshUserInfo();
        }
      } else {
        const nextUser = await loginWithTestUser();
        setUser(nextUser);
        setIsAuthenticated(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化失败');
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsReady(true);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    /*应用启动后恢复本地草稿同步队列，保证离线编辑可在后续静默收敛。 */
    void ensureFragmentLocalMirrorReady()
      .then(async () => {
        await restoreLocalFragmentSyncQueue();
        await restoreRemoteFragmentBodySyncQueue();
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    /*前后台切换时主动唤醒同步队列，避免正文草稿长期停留本地。 */
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void wakeLocalFragmentSyncQueue().catch(() => undefined);
        void wakeRemoteFragmentBodySyncQueue().catch(() => undefined);
        return;
      }
      if (nextState === 'active') {
        void wakeLocalFragmentSyncQueue().catch(() => undefined);
        void wakeRemoteFragmentBodySyncQueue().catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const login = async () => {
    const nextUser = await loginWithTestUser();
    setUser(nextUser);
    setIsAuthenticated(true);
    setError(null);
    return nextUser;
  };

  const logout = async () => {
    await logoutService();
    setUser(null);
    setIsAuthenticated(false);
    setError(null);
  };

  const value = useMemo<AppSessionContextValue>(
    () => ({
      isReady,
      isAuthenticated,
      user,
      error,
      loginWithTestUser: login,
      logout,
      refreshUserInfo,
    }),
    [error, isAuthenticated, isReady, user]
  );

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error('useAppSession must be used within AppSessionProvider');
  }
  return context;
}
