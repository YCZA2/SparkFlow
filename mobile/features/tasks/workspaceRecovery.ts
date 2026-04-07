import { assertTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';

import { recoverPendingMediaPipelines } from './mediaRecovery';
import { recoverPendingScriptPipelines } from './scriptRecovery';

export async function recoverWorkspaceTaskState(scope: TaskExecutionScope): Promise<void> {
  /*工作区挂载后统一恢复备份、媒体任务和脚本生成的本地追踪状态。 */
  assertTaskScopeActive(scope);
  await Promise.allSettled([
    recoverPendingMediaPipelines(scope),
    recoverPendingScriptPipelines(scope),
  ]);
}
