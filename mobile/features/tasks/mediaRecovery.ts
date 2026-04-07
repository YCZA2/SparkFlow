import { assertTaskScopeActive, isTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable } from '@/features/core/db/schema';
import { fetchPipelineRun, waitForPipelineTerminal } from '@/features/pipelines/api';
import { syncMediaIngestionPipelineState } from '@/features/pipelines/mediaIngestionRecovery';
import { isNull } from 'drizzle-orm';

async function recoverSingleMediaPipeline(
  fragmentId: string,
  pipelineRunId: string,
  scope: TaskExecutionScope
): Promise<void> {
  /*媒体任务恢复时优先同步当前状态，仍在运行则转为后台等待终态。 */
  assertTaskScopeActive(scope);
  const pipeline = await fetchPipelineRun(pipelineRunId);
  if (pipeline.status === 'succeeded' || pipeline.status === 'failed' || pipeline.status === 'cancelled') {
    await syncMediaIngestionPipelineState(fragmentId, pipeline, { scope });
    return;
  }
  void waitForPipelineTerminal(pipelineRunId, { timeoutMs: 180_000, scope })
    .then(async (terminalRun) => {
      if (!isTaskScopeActive(scope)) {
        return;
      }
      await syncMediaIngestionPipelineState(fragmentId, terminalRun, { scope });
    })
    .catch((error) => {
      if (isTaskScopeActive(scope)) {
        console.warn('恢复媒体导入状态失败:', pipelineRunId, error);
      }
    });
}

export async function recoverPendingMediaPipelines(scope: TaskExecutionScope): Promise<void> {
  /*扫描当前工作区里带 pipeline_run_id 的媒体 placeholder，并恢复后台状态。 */
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
      await recoverSingleMediaPipeline(row.id, row.mediaPipelineRunId as string, scope);
    })
  );
}
