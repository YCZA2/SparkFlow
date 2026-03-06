import { useAppSession } from '@/providers/AppSessionProvider';
export type { UserInfo } from '@/features/auth/api';

export function useAuth() {
  const session = useAppSession();

  return {
    isLoading: !session.isReady,
    isAuthenticated: session.isAuthenticated,
    user: session.user,
    error: session.error,
    loginWithTestUser: session.loginWithTestUser,
    logout: session.logout,
    refreshUserInfo: session.refreshUserInfo,
    initAuth: session.refreshUserInfo,
  };
}
