import { getDatabaseWorkspaceUserId, getLocalDatabase } from '@/features/core/db/database';
import { ensureFileRuntimeReady } from '@/features/core/files/runtime';
import { createRetryableTask } from '@/features/core/retryableTask';

const runtimeInitializer = createRetryableTask(async () => {
  /*预热 script store 时同样需要先把文件目录和 SQLite 准备好。 */
  await ensureFileRuntimeReady();
  await getLocalDatabase();
});

export function resetScriptStoreRuntime(): void {
  /*工作区切换后允许下一个账号重新预热自己的本地 store。 */
  runtimeInitializer.reset();
}

/*确保 script 本地真值依赖的数据库与文件目录已提前就绪。 */
export async function ensureScriptStoreReady(): Promise<void> {
  if (!getDatabaseWorkspaceUserId()) {
    return;
  }
  await runtimeInitializer.run();
}
