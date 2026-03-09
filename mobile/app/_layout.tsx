import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { PaperProvider } from 'react-native-paper';

import { LoadingState, ScreenState } from '@/components/ScreenState';
import { useColorScheme } from '@/components/useColorScheme';
import { BackButton } from '@/components/layout/BackButton';
import { Drawer } from '@/components/Drawer/Drawer';
import { DrawerBackdrop } from '@/components/Drawer/DrawerBackdrop';
import { createDebugLogEntry, emitDebugLog } from '@/features/debug-log/store';
import { AudioCaptureProvider } from '@/features/recording/AudioCaptureProvider';
import { AppSessionProvider, useAppSession } from '@/providers/AppSessionProvider';
import { DebugLogProvider } from '@/providers/DebugLogProvider';
import { DrawerProvider, useDrawer } from '@/providers/DrawerProvider';
import { QuickActionBarProvider } from '@/providers/QuickActionBarProvider';
import { QuickActionBar } from '@/components/QuickActionBar';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) {
      emitDebugLog(
        createDebugLogEntry({
          level: 'error',
          source: 'root-layout',
          message: error,
        })
      );
      throw error;
    }
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
    <DebugLogProvider>
      <AppSessionProvider>
        <DrawerProvider>
          <QuickActionBarProvider>
            <AudioCaptureProvider>
              <RootLayoutNav />
            </AudioCaptureProvider>
          </QuickActionBarProvider>
        </DrawerProvider>
      </AppSessionProvider>
    </DebugLogProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const session = useAppSession();
  const { isOpen, close } = useDrawer();

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
            headerLeft: () => <BackButton />,
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              headerShown: false,
              title: '返回',
            }}
          />
          <Stack.Screen
            name="profile"
            options={{
              headerShown: false,
              title: '我的',
            }}
          />
          <Stack.Screen
            name="folder/[id]"
            options={{
              headerShown: false,
              title: '文件夹',
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
          <Stack.Screen
            name="debug-logs"
            options={{
              title: '错误日志',
              headerShown: true,
            }}
          />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="network-settings"
            options={{
              title: '网络设置',
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="test-api"
            options={{
              title: 'API 测试',
              headerShown: true,
            }}
          />
        </Stack>
        {/* 底部快捷操作栏 - 悬浮在页面之上 */}
        <QuickActionBar />
        {/* 抽屉菜单 */}
        {isOpen && <DrawerBackdrop onPress={close} />}
        {isOpen && <Drawer />}
      </ThemeProvider>
    </PaperProvider>
  );
}
