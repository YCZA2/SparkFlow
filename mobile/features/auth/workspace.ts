import { setDatabaseWorkspace } from '@/features/core/db/database';
import { setFileRuntimeWorkspace } from '@/features/core/files/runtime';
import { clearWorkspaceQueryCache } from '@/features/core/query/workspace';
import { resetFragmentStoreRuntime } from '@/features/fragments/store';
import { resetScriptStoreRuntime } from '@/features/scripts/store';

let workspaceEpoch = 0;

async function applyWorkspace(userId: string | null): Promise<void> {
  /*每次切换工作区都推进 epoch，让飞行中的旧账号任务自动失效。 */
  workspaceEpoch += 1;
  await setDatabaseWorkspace(userId);
  setFileRuntimeWorkspace(userId);
  resetFragmentStoreRuntime();
  resetScriptStoreRuntime();
  clearWorkspaceQueryCache();
}

export async function activateUserWorkspace(userId: string): Promise<void> {
  /*登录成功后切换到对应账号工作区，让本地 DB 和文件目录统一按用户隔离。 */
  await applyWorkspace(userId);
}

export async function clearUserWorkspace(): Promise<void> {
  /*退出登录时卸载当前账号工作区，避免后续继续读写上一位用户的数据。 */
  await applyWorkspace(null);
}

export function getWorkspaceEpoch(): number {
  /*暴露当前工作区 epoch，供异步任务在回写前校验上下文是否仍然有效。 */
  return workspaceEpoch;
}
