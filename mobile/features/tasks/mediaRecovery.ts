import { assertTaskScopeActive, isTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable } from '@/features/core/db/schema';
import { fetchTaskRun, isTaskTerminal } from '@/features/tasks/api';
import { observeTaskRunUntilTerminal } from '@/features/tasks/taskQuery';
import { buildTaskRecoveryKey, createTaskRecoveryRegistry } from '@/features/tasks/taskRecoveryRegistry';
import { syncMediaIngestionTaskState } from './mediaIngestionTaskRecovery';
import { isNull } from 'drizzle-orm';

const mediaTaskRecoveryRegistry = createTaskRecoveryRegistry();

async function recoverSingleMediaTask(
  fragmentId: string,
  taskRunId: string,
  scope: TaskExecutionScope
): Promise<void> {
  /*媒体任务恢复时优先同步当前状态，仍在运行则转为后台等待终态。 */
  const recoveryKey = buildTaskRecoveryKey('media', taskRunId, scope);
  if (!mediaTaskRecoveryRegistry.begin(recoveryKey)) {
    return;
  }

  let handedOffToObserver = false;

  assertTaskScopeActive(scope);
  try {
    const task = await fetchTaskRun(taskRunId);
    if (isTaskTerminal(task.status)) {
      await syncMediaIngestionTaskState(fragmentId, task, { scope });
      return;
    }

    handedOffToObserver = true;
    observeTaskRunUntilTerminal(taskRunId, {
      timeoutMs: 180_000,
      scope,
      onTerminal: async (terminalRun) => {
        try {
          if (!isTaskScopeActive(scope)) {
            return;
          }
          await syncMediaIngestionTaskState(fragmentId, terminalRun, { scope });
        } finally {
          mediaTaskRecoveryRegistry.finish(recoveryKey);
        }
      },
      onError: async (error) => {
        try {
          if (isTaskScopeActive(scope)) {
            console.warn('恢复媒体导入状态失败:', taskRunId, error);
          }
        } finally {
          mediaTaskRecoveryRegistry.finish(recoveryKey);
        }
      },
    });
  } finally {
    if (!handedOffToObserver) {
      mediaTaskRecoveryRegistry.finish(recoveryKey);
    }
  }
}

export async function trackPendingMediaTask(
  fragmentId: string,
  taskRunId: string,
  scope: TaskExecutionScope
): Promise<void> {
  /*页面创建媒体任务后立即交给工作区恢复层托管，避免离开当前页后无人继续收尾。 */
  await recoverSingleMediaTask(fragmentId, taskRunId, scope);
}

export async function recoverPendingMediaTasks(scope: TaskExecutionScope): Promise<void> {
  /*扫描当前工作区里带 task_id 的媒体 placeholder，并恢复后台状态。 */
  assertTaskScopeActive(scope);
  const database = await getLocalDatabase();
  const rows = await database
    .select({
      id: fragmentsTable.id,
      mediaTaskRunId: fragmentsTable.mediaTaskRunId,
      mediaTaskStatus: fragmentsTable.mediaTaskStatus,
    })
    .from(fragmentsTable)
    .where(isNull(fragmentsTable.deletedAt));

  const pendingRows = rows.filter(
    (row) =>
      Boolean(row.mediaTaskRunId) &&
      !isTaskTerminal(String(row.mediaTaskStatus ?? ''))
  );

  await Promise.allSettled(
    pendingRows.map(async (row) => {
      await recoverSingleMediaTask(row.id, row.mediaTaskRunId as string, scope);
    })
  );
}
