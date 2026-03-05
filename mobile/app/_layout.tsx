import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { PaperProvider } from 'react-native-paper';

import { useColorScheme } from '@/components/useColorScheme';
import { initApiBaseUrl } from '@/constants/config';

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
  const [apiInitialized, setApiInitialized] = useState(false);

  // 初始化 API 基础地址
  useEffect(() => {
    async function init() {
      try {
        await initApiBaseUrl();
        console.log('[App] API 基础地址已初始化');
      } catch (error) {
        console.error('[App] API 基础地址初始化失败:', error);
      } finally {
        setApiInitialized(true);
      }
    }
    init();
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && apiInitialized) {
      SplashScreen.hideAsync();
    }
  }, [loaded, apiInitialized]);

  if (!loaded || !apiInitialized) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <PaperProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="generate" options={{ title: 'AI 编导' }} />
          <Stack.Screen name="script/[id]" options={{ title: '口播稿详情' }} />
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
