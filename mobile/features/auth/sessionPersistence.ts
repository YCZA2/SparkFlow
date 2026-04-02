import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '@/constants/config';
import { clearDeviceSessionInvalid, markDeviceSessionInvalid } from '@/features/auth/deviceSession';
import { clearUserWorkspace } from '@/features/auth/workspace';

export async function clearPersistedAuthState(options?: {
  invalidReason?: string | null;
}): Promise<void> {
  /*清理当前账号的持久化登录态与工作区绑定，供退出登录和会话失效共用。 */
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN),
    SecureStore.deleteItemAsync(STORAGE_KEYS.USER),
  ]);
  if (options?.invalidReason) {
    await markDeviceSessionInvalid(options.invalidReason);
  } else {
    await clearDeviceSessionInvalid();
  }
  await clearUserWorkspace();
}
