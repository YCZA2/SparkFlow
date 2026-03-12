import { getLocalDatabase } from '@/features/core/db/database';
import { ensureFileRuntimeReady, getFragmentMetaPath } from '@/features/core/files/runtime';

import { migrateLegacyAsyncStorageIfNeeded } from './legacyMigration';

let storeReadyPromise: Promise<void> | null = null;

/*确保本地数据库、文件目录和旧缓存迁移在应用启动阶段完成。 */
export async function ensureFragmentStoreReady(): Promise<void> {
  if (!storeReadyPromise) {
    storeReadyPromise = (async () => {
      await ensureFileRuntimeReady();
      await getLocalDatabase();
      await migrateLegacyAsyncStorageIfNeeded();
    })();
  }
  await storeReadyPromise;
}

/*返回片段的 meta 目录路径，便于调试和后续扩展更多本地文件。 */
export function readFragmentMetaPath(fragmentId: string): string {
  return getFragmentMetaPath(fragmentId);
}

