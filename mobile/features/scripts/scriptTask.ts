import { assertTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { awaitTaskRunTerminal } from '@/features/tasks/taskQuery';
import { forgetPendingScriptTask } from '@/features/scripts/pendingScriptTasks';
import { markScriptsStale } from '@/features/scripts/store';
import { hydrateGeneratedScriptToLocal } from '@/features/scripts/sync';
import type { Script } from '@/types/script';
import type { TaskRun } from '@/types/task';

export async function resolveScriptFromTerminalTask(
  task: Pick<TaskRun, 'status' | 'resource' | 'error_message'>,
  fallbackMessage: string,
  options: { scope: TaskExecutionScope; taskRunId: string }
): Promise<Script> {
  /*统一消费已知终态的脚本 task：成功时落本地，失败时清理任务登记并抛错。 */
  const scriptId =
    task.status === 'succeeded' && task.resource.resource_type === 'script'
      ? task.resource.resource_id
      : null;

  if (!scriptId) {
    assertTaskScopeActive(options.scope);
    await forgetPendingScriptTask(options.scope.userId, options.taskRunId);
    throw new Error(task.error_message || fallbackMessage);
  }

  assertTaskScopeActive(options.scope);
  const script = await hydrateGeneratedScriptToLocal(scriptId, { scope: options.scope });
  markScriptsStale();
  await forgetPendingScriptTask(options.scope.userId, options.taskRunId);
  return script;
}

export async function resolveScriptFromTask(
  taskRunId: string,
  fallbackMessage: string,
  options: { scope: TaskExecutionScope }
): Promise<Script> {
  /*统一消费任务态脚本结果：等待 task 终态，落本地真值，清除任务登记。 */
  const task = await awaitTaskRunTerminal(taskRunId, { scope: options.scope });
  return await resolveScriptFromTerminalTask(task, fallbackMessage, {
    scope: options.scope,
    taskRunId,
  });
}
