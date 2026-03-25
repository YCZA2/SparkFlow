import { getDatabaseWorkspaceUserId, getLocalDatabase } from '@/features/core/db/database';
import { ensureFileRuntimeReady } from '@/features/core/files/runtime';

let storeReadyPromise: Promise<void> | null = null;

export function resetScriptStoreRuntime(): void {
  /*工作区切换后允许下一个账号重新预热自己的本地 store。 */
  storeReadyPromise = null;
}

/*确保 script 本地真值依赖的数据库与文件目录已提前就绪。 */
export async function ensureScriptStoreReady(): Promise<void> {
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
