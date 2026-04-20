import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { appQueryClient } from '@/features/tasks/queryClient';

export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    /*让 React Query 跟随原生 AppState 切前后台，避免后台轮询继续占用请求。 */
    if (Platform.OS === 'web') {
      return;
    }

    const onAppStateChange = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  return <QueryClientProvider client={appQueryClient}>{children}</QueryClientProvider>;
}
