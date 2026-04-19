import { assertTaskScopeActive, isTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable } from '@/features/core/db/schema';
import { fetchTaskRun, waitForTaskTerminal } from '@/features/tasks/api';
import { syncMediaIngestionTaskState } from './mediaIngestionTaskRecovery';
import { isNull } from 'drizzle-orm';

async function recoverSingleMediaTask(
  fragmentId: string,
  taskRunId: string,
  scope: TaskExecutionScope
): Promise<void> {
  /*媒体任务恢复时优先同步当前状态，仍在运行则转为后台等待终态。 */
  assertTaskScopeActive(scope);
  const task = await fetchTaskRun(taskRunId);
  if (task.status === 'succeeded' || task.status === 'failed' || task.status === 'cancelled') {
    await syncMediaIngestionTaskState(fragmentId, task, { scope });
    return;
  }
  void waitForTaskTerminal(taskRunId, { timeoutMs: 180_000, scope })
    .then(async (terminalRun) => {
      if (!isTaskScopeActive(scope)) {
        return;
      }
      await syncMediaIngestionTaskState(fragmentId, terminalRun, { scope });
    })
    .catch((error) => {
      if (isTaskScopeActive(scope)) {
        console.warn('恢复媒体导入状态失败:', taskRunId, error);
      }
    });
}

export async function recoverPendingMediaTasks(scope: TaskExecutionScope): Promise<void> {
  /*扫描当前工作区里带 task_id 的媒体 placeholder，并恢复后台状态。 */
  assertTaskScopeActive(scope);
  const database = await getLocalDatabase();
  const rows = await database
    .select({
      id: fragmentsTable.id,
      mediaPipelineRunId: fragmentsTable.mediaPipelineRunId,
      mediaPipelineStatus: fragmentsTable.mediaPipelineStatus,
    })
    .from(fragmentsTable)
    .where(isNull(fragmentsTable.deletedAt));

  const pendingRows = rows.filter(
    (row) =>
      Boolean(row.mediaPipelineRunId) &&
      row.mediaPipelineStatus !== 'succeeded'
  );

  await Promise.allSettled(
    pendingRows.map(async (row) => {
      await recoverSingleMediaTask(row.id, row.mediaPipelineRunId as string, scope);
    })
  );
}
