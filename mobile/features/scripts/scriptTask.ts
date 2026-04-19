import { assertTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { waitForTaskTerminal } from '@/features/tasks/api';
import { forgetPendingScriptTask } from '@/features/scripts/pendingScriptTasks';
import { markScriptsStale } from '@/features/scripts/store';
import { syncRemoteScriptDetailToLocal } from '@/features/scripts/sync';
import type { Script } from '@/types/script';

export async function resolveScriptFromTask(
  taskRunId: string,
  fallbackMessage: string,
  options: { scope: TaskExecutionScope }
): Promise<Script> {
  /*统一消费任务态脚本结果：等待 task 终态，落本地真值，清除任务登记。 */
  const task = await waitForTaskTerminal(taskRunId, { scope: options.scope });
  const scriptId =
    task.status === 'succeeded' && task.resource.resource_type === 'script'
      ? task.resource.resource_id
      : null;
  if (!scriptId) {
    assertTaskScopeActive(options.scope);
    await forgetPendingScriptTask(options.scope.userId, taskRunId);
    throw new Error(task.error_message || fallbackMessage);
  }
  assertTaskScopeActive(options.scope);
  const script = await syncRemoteScriptDetailToLocal(scriptId, { scope: options.scope });
  markScriptsStale();
  await forgetPendingScriptTask(options.scope.userId, taskRunId);
  return script;
}
