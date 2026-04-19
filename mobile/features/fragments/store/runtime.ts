import { getDatabaseWorkspaceUserId, getLocalDatabase } from '@/features/core/db/database';
import { ensureFileRuntimeReady } from '@/features/core/files/runtime';

let storeReadyPromise: Promise<void> | null = null;

export function resetFragmentStoreRuntime(): void {
  /*工作区切换后允许下一个账号重新预热自己的本地 store。 */
  storeReadyPromise = null;
}

/*确保本地数据库、文件目录在应用启动阶段完成。 */
export async function ensureFragmentStoreReady(): Promise<void> {
  if (!getDatabaseWorkspaceUserId()) {
    return;
  }
  if (!storeReadyPromise) {
    storeReadyPromise = (async () => {
      await ensureFileRuntimeReady();
      await getLocalDatabase();
    })();
  }
  await storeReadyPromise;
}
