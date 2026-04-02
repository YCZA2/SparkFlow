import type { ExpoConfig } from 'expo/config';

type AppEnvironment = 'development' | 'production';

interface AppIdentity {
  appName: string;
  slug: string;
  scheme: string;
  iosBundleIdentifier: string;
  androidPackage: string;
}

function resolveAppEnvironment(): AppEnvironment {
  /*将 preview/internal 构建统一视作 development，仅 production 进入正式受限模式。 */
  return process.env.APP_ENV === 'production' ? 'production' : 'development';
}

function resolveDefaultApiBaseUrl(appEnv: AppEnvironment): string {
  /*默认 API 地址优先读外部环境变量，缺省时回退到对应环境的安全基线。 */
  const fromEnv = (process.env.APP_DEFAULT_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  return appEnv === 'production' ? 'https://www.onepercent.ltd' : 'http://127.0.0.1:8000';
}

function resolveIdentity(appEnv: AppEnvironment): AppIdentity {
  /*dev/prod 使用独立 bundle id 和 scheme，避免同机安装时互相覆盖。 */
  if (appEnv === 'production') {
    return {
      appName: 'SparkFlow',
      slug: 'sparkflow-mobile',
      scheme: 'sparkflowmobile',
      iosBundleIdentifier: 'com.sparkflow.mobile',
      androidPackage: 'com.sparkflow.mobile',
    };
  }
  return {
    appName: 'SparkFlow Dev',
    slug: 'sparkflow-mobile-dev',
    scheme: 'sparkflowmobiledev',
    iosBundleIdentifier: 'com.sparkflow.mobile.dev',
    androidPackage: 'com.sparkflow.mobile.dev',
  };
}

export default (): ExpoConfig => {
  const appEnv = resolveAppEnvironment();
  const identity = resolveIdentity(appEnv);
  const defaultApiBaseUrl = resolveDefaultApiBaseUrl(appEnv);
  const enableDeveloperTools = appEnv !== 'production';

  return {
    name: identity.appName,
    slug: identity.slug,
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: identity.scheme,
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: identity.iosBundleIdentifier,
      buildNumber: '1.0.0',
      infoPlist: {
        NSMicrophoneUsageDescription: '需要访问麦克风来录制语音灵感',
        NSCameraUsageDescription: '需要访问相机来拍摄口播视频',
        NSPhotoLibraryUsageDescription: '需要访问相册来保存录制的视频',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: identity.androidPackage,
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-web-browser',
      './plugins/withTsinghuaPodsource.js',
      'expo-audio',
      'expo-sqlite',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: '1ae2447f-7a68-4bcc-a77e-d89658496f56',
      },
      appEnv,
      defaultApiBaseUrl,
      enableDeveloperTools,
    },
    owner: 'ycza',
  };
};
