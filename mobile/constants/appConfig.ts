import Constants from 'expo-constants';

export type AppEnvironment = 'development' | 'production';

interface SparkFlowRuntimeConfig {
  appEnv: AppEnvironment;
  defaultApiBaseUrl: string;
  enableDeveloperTools: boolean;
}

function readRuntimeConfig(): SparkFlowRuntimeConfig {
  /*统一读取 Expo runtime config，避免页面各自猜测当前构建环境。 */
  const extra = (Constants.expoConfig?.extra ?? {}) as Partial<SparkFlowRuntimeConfig>;
  const appEnv = extra.appEnv === 'production' ? 'production' : 'development';
  const defaultApiBaseUrl =
    typeof extra.defaultApiBaseUrl === 'string' && extra.defaultApiBaseUrl.trim()
      ? extra.defaultApiBaseUrl.trim()
      : appEnv === 'production'
        ? 'https://www.onepercent.ltd'
        : 'http://127.0.0.1:8000';

  return {
    appEnv,
    defaultApiBaseUrl,
    enableDeveloperTools: appEnv !== 'production' && extra.enableDeveloperTools !== false,
  };
}

export const runtimeConfig = readRuntimeConfig();

export function getAppEnvironment(): AppEnvironment {
  /*返回当前运行包的环境层级，供配置和页面守卫复用。 */
  return runtimeConfig.appEnv;
}

export function getDefaultApiBaseUrl(): string {
  /*返回当前构建声明的默认业务 API 地址。 */
  return runtimeConfig.defaultApiBaseUrl;
}

export function isDeveloperToolsEnabled(): boolean {
  /*开发者工具入口只允许在 development 包中启用。 */
  return runtimeConfig.enableDeveloperTools;
}
