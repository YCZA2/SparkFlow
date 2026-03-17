import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/constants/config';

let deviceSessionInvalidReasonMemory: string | null = null;

/*读取当前设备是否被标记为远端会话失效。 */
export async function getDeviceSessionInvalidReason(): Promise<string | null> {
  if (deviceSessionInvalidReasonMemory !== null) {
    return deviceSessionInvalidReasonMemory;
  }
  deviceSessionInvalidReasonMemory = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_SESSION_INVALID);
  return deviceSessionInvalidReasonMemory;
}

/*在收到设备会话失效错误后持久化标记，阻止后续自动补 token。 */
export async function markDeviceSessionInvalid(reason?: string | null): Promise<void> {
  const nextReason = reason?.trim() || '当前设备会话已失效，请重新登录';
  deviceSessionInvalidReasonMemory = nextReason;
  await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_SESSION_INVALID, nextReason);
}

/*显式重新登录成功后清理会话失效标记，恢复远端能力。 */
export async function clearDeviceSessionInvalid(): Promise<void> {
  deviceSessionInvalidReasonMemory = null;
  await AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_SESSION_INVALID);
}
