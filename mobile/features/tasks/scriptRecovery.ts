import { assertTaskScopeActive, isTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { forgetPendingScriptTask, listPendingScriptTasks } from '@/features/scripts/pendingScriptTasks';
import { hydrateGeneratedScriptToLocal } from '@/features/scripts/sync';
import { markScriptsStale } from '@/features/scripts/store';
import { fetchTaskRun, waitForTaskTerminal } from '@/features/tasks/api';
import type { TaskRun } from '@/types/task';

function resolveScriptIdFromTask(task: Pick<TaskRun, 'status' | 'resource'>): string | null {
  /*脚本类 task 成功后统一从 resource 中取最终 script_id。 */
  if (task.status !== 'succeeded' || task.resource?.resource_type !== 'script') {
    return null;
  }
  return task.resource.resource_id || null;
}

async function syncRecoveredScriptTask(
  task: Pick<TaskRun, 'id' | 'status' | 'resource'>,
  scope: TaskExecutionScope
): Promise<void> {
  /*工作区恢复命中脚本终态后，把远端详情补回本地真值并清掉待恢复登记。 */
  assertTaskScopeActive(scope);
  const scriptId = resolveScriptIdFromTask(task);
  if (scriptId) {
    await hydrateGeneratedScriptToLocal(scriptId, { scope });
    markScriptsStale();
  }
  await forgetPendingScriptTask(scope.userId, task.id);
}

async function recoverSingleScriptTask(task: { taskRunId: string }, scope: TaskExecutionScope): Promise<void> {
  /*脚本恢复先查一次当前状态，未终态则继续后台轮询直到收敛。 */
  assertTaskScopeActive(scope);
  const currentTask = await fetchTaskRun(task.taskRunId);
  if (currentTask.status === 'succeeded' || currentTask.status === 'failed' || currentTask.status === 'cancelled') {
    await syncRecoveredScriptTask(currentTask, scope);
    return;
  }
  void waitForTaskTerminal(task.taskRunId, { timeoutMs: 180_000, scope })
    .then(async (terminalRun) => {
      if (!isTaskScopeActive(scope)) {
        return;
      }
      await syncRecoveredScriptTask(terminalRun, scope);
    })
    .catch((error) => {
      if (isTaskScopeActive(scope)) {
        console.warn('恢复脚本任务状态失败:', task.taskRunId, error);
      }
    });
}

export async function recoverPendingScriptTasks(scope: TaskExecutionScope): Promise<void> {
  /*从工作区注册表恢复尚未完成的脚本任务，避免切号后丢失生成结果。 */
  const tasks = await listPendingScriptTasks(scope.userId);
  await Promise.allSettled(tasks.map(async (task) => await recoverSingleScriptTask(task, scope)));
}
