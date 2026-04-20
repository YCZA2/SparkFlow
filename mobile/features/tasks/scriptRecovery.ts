import { assertTaskScopeActive, isTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { forgetPendingScriptTask, listPendingScriptTasks } from '@/features/scripts/pendingScriptTasks';
import { hydrateGeneratedScriptToLocal } from '@/features/scripts/sync';
import { markScriptsStale } from '@/features/scripts/store';
import { fetchTaskRun, isTaskTerminal } from '@/features/tasks/api';
import { buildTaskRecoveryKey, createTaskRecoveryRegistry } from '@/features/tasks/taskRecoveryRegistry';
import { observeTaskRunUntilTerminal } from '@/features/tasks/taskQuery';
import type { TaskRun } from '@/types/task';

const scriptTaskRecoveryRegistry = createTaskRecoveryRegistry();

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
  const recoveryKey = buildTaskRecoveryKey('script', task.taskRunId, scope);
  if (!scriptTaskRecoveryRegistry.begin(recoveryKey)) {
    return;
  }

  let handedOffToObserver = false;

  assertTaskScopeActive(scope);
  try {
    const currentTask = await fetchTaskRun(task.taskRunId);
    if (isTaskTerminal(currentTask.status)) {
      await syncRecoveredScriptTask(currentTask, scope);
      return;
    }

    handedOffToObserver = true;
    observeTaskRunUntilTerminal(task.taskRunId, {
      timeoutMs: 180_000,
      scope,
      onTerminal: async (terminalRun) => {
        try {
          if (!isTaskScopeActive(scope)) {
            return;
          }
          await syncRecoveredScriptTask(terminalRun, scope);
        } finally {
          scriptTaskRecoveryRegistry.finish(recoveryKey);
        }
      },
      onError: async (error) => {
        try {
          if (isTaskScopeActive(scope)) {
            console.warn('恢复脚本任务状态失败:', task.taskRunId, error);
          }
        } finally {
          scriptTaskRecoveryRegistry.finish(recoveryKey);
        }
      },
    });
  } finally {
    if (!handedOffToObserver) {
      scriptTaskRecoveryRegistry.finish(recoveryKey);
    }
  }
}

export async function trackPendingScriptTask(
  taskRunId: string,
  scope: TaskExecutionScope
): Promise<void> {
  /*页面发起脚本生成后立即接入恢复层，保证离开生成页后仍会继续落本地真值。 */
  await recoverSingleScriptTask({ taskRunId }, scope);
}

export async function recoverPendingScriptTasks(scope: TaskExecutionScope): Promise<void> {
  /*从工作区注册表恢复尚未完成的脚本任务，避免切号后丢失生成结果。 */
  const tasks = await listPendingScriptTasks(scope.userId);
  await Promise.allSettled(tasks.map(async (task) => await recoverSingleScriptTask(task, scope)));
}
