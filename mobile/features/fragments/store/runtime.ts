import { getLocalDatabase } from '@/features/core/db/database';
import { ensureFileRuntimeReady, getFragmentMetaPath } from '@/features/core/files/runtime';

let storeReadyPromise: Promise<void> | null = null;

/*确保本地数据库、文件目录在应用启动阶段完成。 */
export async function ensureFragmentStoreReady(): Promise<void> {
  if (!storeReadyPromise) {
    storeReadyPromise = (async () => {
      await ensureFileRuntimeReady();
      await getLocalDatabase();
    })();
  }
  await storeReadyPromise;
}

