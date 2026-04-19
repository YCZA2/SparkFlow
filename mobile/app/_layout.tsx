import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import '../global.css';
import 'react-native-reanimated';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

import { LoadingState } from '@/components/ScreenState';
import { useColorScheme } from '@/components/useColorScheme';
import { ImportActionSheet } from '@/components/ImportActionSheet';
import { BackButton } from '@/components/layout/BackButton';
import { Drawer } from '@/components/Drawer/Drawer';
import { DrawerBackdrop } from '@/components/Drawer/DrawerBackdrop';
import { createDebugLogEntry, emitDebugLog } from '@/features/debug-log/store';
import { AudioCaptureProvider } from '@/features/recording/AudioCaptureProvider';
import { AppSessionProvider, useAppSession } from '@/providers/AppSessionProvider';
import { DebugLogProvider } from '@/providers/DebugLogProvider';
import { DrawerProvider, useDrawer } from '@/providers/DrawerProvider';
import { ImportActionSheetProvider } from '@/providers/ImportActionSheetProvider';
import { QuickActionBarProvider } from '@/providers/QuickActionBarProvider';
import { QuickActionBar } from '@/components/QuickActionBar';
import { isDeveloperToolsEnabled } from '@/constants/appConfig';

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
          <ImportActionSheetProvider>
            <QuickActionBarProvider>
              <AudioCaptureProvider>
                <RootLayoutNav />
              </AudioCaptureProvider>
            </QuickActionBarProvider>
          </ImportActionSheetProvider>
        </DrawerProvider>
      </AppSessionProvider>
    </DebugLogProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const session = useAppSession();
  const { isOpen, close } = useDrawer();
  const router = useRouter();
  const developerToolsEnabled = isDeveloperToolsEnabled();

  /*session 就绪后，未登录则强制跳转到登录页（冷启动和会话失效均覆盖）。*/
  useEffect(() => {
    if (!session.isReady) return;
    if (!session.isAuthenticated) {
      router.replace('/login');
    }
  }, [session.isReady, session.isAuthenticated, router]);

  if (!session.isReady) {
    return <LoadingState message="正在准备应用..." />;
  }

  if (!session.isAuthenticated) {
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
              name="login"
              options={{
                headerShown: false,
                title: '登录',
              }}
            />
          </Stack>
        </ThemeProvider>
      </PaperProvider>
    );
  }

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
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
          <Stack.Screen
            name="text-note"
            options={{ title: '写下灵感', headerShown: false }}
          />
          <Stack.Screen name="import-link" options={{ title: '导入链接', headerShown: true }} />
          <Stack.Screen name="import-audio" options={{ title: '导入音频', headerShown: true }} />
          <Stack.Screen name="knowledge" options={{ title: '知识库', headerShown: true }} />
          {developerToolsEnabled ? (
            <Stack.Screen
              name="debug-logs"
              options={{
                title: '错误日志',
                headerShown: true,
              }}
            />
          ) : null}
          {developerToolsEnabled ? (
            <Stack.Screen
              name="network-settings"
              options={{
                title: '网络设置',
                headerShown: true,
              }}
            />
          ) : null}
          {developerToolsEnabled ? (
            <Stack.Screen
              name="test-api"
              options={{
                title: 'API 测试',
                headerShown: true,
              }}
            />
          ) : null}
        </Stack>
        {/* 底部快捷操作栏 - 悬浮在页面之上 */}
        <QuickActionBar />
        <ImportActionSheet />
        {/* 抽屉菜单 */}
        {isOpen && <DrawerBackdrop onPress={close} />}
        {isOpen && <Drawer />}
      </ThemeProvider>
    </PaperProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
});
