import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/constants/config';

function generateDeviceId(): string {
  /*为本地设备生成稳定标识，供单设备在线和备份审计复用。 */
  return `sparkflow-device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const current = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (current) {
    return current;
  }
  const next = generateDeviceId();
  await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, next);
  return next;
}
