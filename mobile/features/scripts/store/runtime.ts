import { getLocalDatabase } from '@/features/core/db/database';
import { ensureFileRuntimeReady } from '@/features/core/files/runtime';

let storeReadyPromise: Promise<void> | null = null;

/*确保 script 本地真值依赖的数据库与文件目录已提前就绪。 */
export async function ensureScriptStoreReady(): Promise<void> {
  if (!storeReadyPromise) {
    storeReadyPromise = (async () => {
      await ensureFileRuntimeReady();
      await getLocalDatabase();
    })();
  }
  await storeReadyPromise;
}
