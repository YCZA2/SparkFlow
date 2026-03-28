import { getDatabaseWorkspaceUserId, getLocalDatabase } from '@/features/core/db/database';
import { ensureFileRuntimeReady } from '@/features/core/files/runtime';
import { createRetryableTask } from '@/features/core/retryableTask';

const runtimeInitializer = createRetryableTask(async () => {
  /*预热 fragment store 前先保证文件目录和 SQLite 都可用。 */
  await ensureFileRuntimeReady();
  await getLocalDatabase();
});

export function resetFragmentStoreRuntime(): void {
  /*工作区切换后允许下一个账号重新预热自己的本地 store。 */
  runtimeInitializer.reset();
}

/*确保本地数据库、文件目录在应用启动阶段完成。 */
export async function ensureFragmentStoreReady(): Promise<void> {
  if (!getDatabaseWorkspaceUserId()) {
    return;
  }
  await runtimeInitializer.run();
}
