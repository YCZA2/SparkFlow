import { assertTaskScopeActive, isTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { forgetPendingScriptPipelineTask, listPendingScriptPipelineTasks } from '@/features/scripts/pendingTasks';
import { syncRemoteScriptDetailToLocal } from '@/features/scripts/sync';
import { markScriptsStale } from '@/features/scripts/store';
import { fetchTaskRun, waitForTaskTerminal } from '@/features/tasks/api';
import type { TaskRun } from '@/types/task';

function resolveScriptIdFromTask(pipeline: Pick<TaskRun, 'status' | 'resource'>): string | null {
  /*脚本类 task 成功后统一从 resource 中取最终 script_id。 */
  if (pipeline.status !== 'succeeded' || pipeline.resource?.resource_type !== 'script') {
    return null;
  }
  return pipeline.resource.resource_id || null;
}

async function syncRecoveredScriptPipeline(
  pipeline: Pick<TaskRun, 'id' | 'status' | 'resource'>,
  scope: TaskExecutionScope
): Promise<void> {
  /*工作区恢复命中脚本终态后，把远端详情补回本地真值并清掉待恢复登记。 */
  assertTaskScopeActive(scope);
  const scriptId = resolveScriptIdFromTask(pipeline);
  if (scriptId) {
    await syncRemoteScriptDetailToLocal(scriptId, { scope });
    markScriptsStale();
  }
  await forgetPendingScriptPipelineTask(scope.userId, pipeline.id);
}

async function recoverSingleScriptPipeline(task: { pipelineRunId: string }, scope: TaskExecutionScope): Promise<void> {
  /*脚本恢复先查一次当前状态，未终态则继续后台轮询直到收敛。 */
  assertTaskScopeActive(scope);
  const pipeline = await fetchTaskRun(task.pipelineRunId);
  if (pipeline.status === 'succeeded' || pipeline.status === 'failed' || pipeline.status === 'cancelled') {
    await syncRecoveredScriptPipeline(pipeline, scope);
    return;
  }
  void waitForTaskTerminal(task.pipelineRunId, { timeoutMs: 180_000, scope })
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

export async function recoverPendingScriptPipelines(scope: TaskExecutionScope): Promise<void> {
  /*从工作区注册表恢复尚未完成的脚本任务，避免切号后丢失生成结果。 */
  const tasks = await listPendingScriptPipelineTasks(scope.userId);
  await Promise.allSettled(tasks.map(async (task) => await recoverSingleScriptPipeline(task, scope)));
}
