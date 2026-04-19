import { assertTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';

import { recoverPendingMediaTasks } from './mediaRecovery';
import { recoverPendingScriptTasks } from './scriptRecovery';

export async function recoverWorkspaceTaskState(scope: TaskExecutionScope): Promise<void> {
  /*工作区挂载后统一恢复备份、媒体任务和脚本生成的本地追踪状态。 */
  assertTaskScopeActive(scope);
  await Promise.allSettled([
    recoverPendingMediaTasks(scope),
    recoverPendingScriptTasks(scope),
  ]);
}
