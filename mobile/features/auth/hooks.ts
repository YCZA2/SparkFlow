import { useAppSession } from '@/providers/AppSessionProvider';

export type { UserInfo } from '@/features/auth/api';

export function useAuth() {
  const session = useAppSession();
  return {
    user: session.user,
    isReady: session.isReady,
    isAuthenticated: session.isAuthenticated,
    error: session.error,
    loginWithTestUser: session.loginWithTestUser,
    logout: session.logout,
    refreshUserInfo: session.refreshUserInfo,
  };
}
