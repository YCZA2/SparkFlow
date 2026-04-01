import { isNull } from 'drizzle-orm';

import { assertTaskScopeActive, isTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable } from '@/features/core/db/schema';
import { forgetPendingScriptPipelineTask, listPendingScriptPipelineTasks } from '@/features/scripts/pendingTasks';
import { syncRemoteScriptDetailToLocal } from '@/features/scripts/sync';
import { markScriptsStale } from '@/features/scripts/refreshSignal';
import { fetchPipelineRun, waitForPipelineTerminal } from '@/features/pipelines/api';
import { syncMediaIngestionPipelineState } from '@/features/pipelines/mediaIngestionRecovery';
import type { PipelineRun } from '@/types/pipeline';

function resolveScriptIdFromPipeline(pipeline: Pick<PipelineRun, 'status' | 'resource'>): string | null {
  /*脚本类 pipeline 成功后统一从 resource 中取最终 script_id。 */
  if (pipeline.status !== 'succeeded' || pipeline.resource?.resource_type !== 'script') {
    return null;
  }
  return pipeline.resource.resource_id || null;
}

async function syncRecoveredScriptPipeline(
  pipeline: Pick<PipelineRun, 'id' | 'status' | 'resource'>,
  scope: TaskExecutionScope
): Promise<void> {
  /*工作区恢复命中脚本终态后，把远端详情补回本地真值并清掉待恢复登记。 */
  assertTaskScopeActive(scope);
  const scriptId = resolveScriptIdFromPipeline(pipeline);
  if (scriptId) {
    await syncRemoteScriptDetailToLocal(scriptId, { scope });
    markScriptsStale();
  }
  await forgetPendingScriptPipelineTask(scope.userId, pipeline.id);
}

async function recoverSingleScriptPipeline(task: { pipelineRunId: string }, scope: TaskExecutionScope): Promise<void> {
  /*脚本恢复先查一次当前状态，未终态则继续后台轮询直到收敛。 */
  assertTaskScopeActive(scope);
  const pipeline = await fetchPipelineRun(task.pipelineRunId);
  if (pipeline.status === 'succeeded' || pipeline.status === 'failed' || pipeline.status === 'cancelled') {
    await syncRecoveredScriptPipeline(pipeline, scope);
    return;
  }
  void waitForPipelineTerminal(task.pipelineRunId, { timeoutMs: 180_000, scope })
    .then(async (terminalRun) => {
      if (!isTaskScopeActive(scope)) {
        return;
      }
      await syncRecoveredScriptPipeline(terminalRun, scope);
    })
    .catch((error) => {
      if (isTaskScopeActive(scope)) {
        console.warn('恢复脚本任务状态失败:', task.pipelineRunId, error);
      }
    });
}

async function recoverPendingScriptPipelines(scope: TaskExecutionScope): Promise<void> {
  /*从工作区注册表恢复尚未完成的脚本任务，避免切号后丢失生成结果。 */
  const tasks = await listPendingScriptPipelineTasks(scope.userId);
  await Promise.allSettled(tasks.map(async (task) => await recoverSingleScriptPipeline(task, scope)));
}

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

async function recoverPendingMediaPipelines(scope: TaskExecutionScope): Promise<void> {
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

export async function recoverWorkspaceTaskState(scope: TaskExecutionScope): Promise<void> {
  /*工作区挂载后统一恢复备份、媒体任务和脚本生成的本地追踪状态。 */
  assertTaskScopeActive(scope);
  await Promise.allSettled([
    recoverPendingMediaPipelines(scope),
    recoverPendingScriptPipelines(scope),
  ]);
}
