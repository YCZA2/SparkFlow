import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
import { restoreLocalFragmentSyncQueue } from '@/features/fragments/localFragmentSyncQueue';

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
    try {
      setError(null);
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
    void restoreLocalFragmentSyncQueue().catch(() => undefined);
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
