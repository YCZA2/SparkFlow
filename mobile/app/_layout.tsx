import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { PaperProvider } from 'react-native-paper';

import { LoadingState, ScreenState } from '@/components/ScreenState';
import { useColorScheme } from '@/components/useColorScheme';
import { AudioCaptureProvider } from '@/features/recording/AudioCaptureProvider';
import { AppSessionProvider, useAppSession } from '@/providers/AppSessionProvider';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AppSessionProvider>
      <AudioCaptureProvider>
        <RootLayoutNav />
      </AudioCaptureProvider>
    </AppSessionProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const session = useAppSession();

  if (!session.isReady) {
    return <LoadingState message="正在准备应用..." />;
  }

  if (session.error) {
    return (
      <ScreenState
        icon="⚠️"
        title="应用初始化失败"
        message={session.error}
        actionLabel="重新登录"
        onAction={session.loginWithTestUser}
      />
    );
  }

  return (
    <PaperProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerBackTitle: '返回',
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              title: '返回',
            }}
          />
          <Stack.Screen name="fragment-cloud" options={{ title: '灵感云图' }} />
          <Stack.Screen name="generate" options={{ title: 'AI 编导' }} />
          <Stack.Screen name="script/[id]" options={{ title: '口播稿详情' }} />
          <Stack.Screen name="shoot" options={{ title: '拍摄' }} />
          <Stack.Screen
            name="record-audio"
            options={{ title: '录音', headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen name="knowledge" options={{ title: '知识库', headerShown: true }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="network-settings"
            options={{
              title: '网络设置',
              headerShown: true,
            }}
          />
        </Stack>
      </ThemeProvider>
    </PaperProvider>
  );
}
