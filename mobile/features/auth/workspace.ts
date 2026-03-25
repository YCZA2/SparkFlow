import { setDatabaseWorkspace } from '@/features/core/db/database';
import { setFileRuntimeWorkspace } from '@/features/core/files/runtime';
import { useFragmentStore } from '@/features/fragments/store/fragmentStore';
import { resetFragmentStoreRuntime } from '@/features/fragments/store/runtime';
import { useScriptStore } from '@/features/scripts/store/scriptStore';
import { resetScriptStoreRuntime } from '@/features/scripts/store/runtime';

export async function activateUserWorkspace(userId: string): Promise<void> {
  /*登录成功后切换到对应账号工作区，让本地 DB 和文件目录统一按用户隔离。 */
  await setDatabaseWorkspace(userId);
  setFileRuntimeWorkspace(userId);
  resetFragmentStoreRuntime();
  resetScriptStoreRuntime();
  useFragmentStore.getState().clearCache();
  useScriptStore.getState().clearCache();
}

export async function clearUserWorkspace(): Promise<void> {
  /*退出登录时卸载当前账号工作区，避免后续继续读写上一位用户的数据。 */
  await setDatabaseWorkspace(null);
  setFileRuntimeWorkspace(null);
  resetFragmentStoreRuntime();
  resetScriptStoreRuntime();
  useFragmentStore.getState().clearCache();
  useScriptStore.getState().clearCache();
}
