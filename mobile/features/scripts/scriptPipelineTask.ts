import { assertTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { waitForPipelineTerminal } from '@/features/pipelines/api';
import { forgetPendingScriptPipelineTask } from '@/features/scripts/pendingTasks';
import { markScriptsStale } from '@/features/scripts/store';
import { syncRemoteScriptDetailToLocal } from '@/features/scripts/sync';
import type { Script } from '@/types/script';

export async function resolveScriptFromPipelineTask(
  pipelineRunId: string,
  fallbackMessage: string,
  options: { scope: TaskExecutionScope }
): Promise<Script> {
  /*统一消费任务态脚本结果：等待 pipeline 终态，落本地真值，清除任务登记。 */
  const pipeline = await waitForPipelineTerminal(pipelineRunId, { scope: options.scope });
  const scriptId =
    pipeline.status === 'succeeded' && pipeline.resource.resource_type === 'script'
      ? pipeline.resource.resource_id
      : null;
  if (!scriptId) {
    assertTaskScopeActive(options.scope);
    await forgetPendingScriptPipelineTask(options.scope.userId, pipelineRunId);
    throw new Error(pipeline.error_message || fallbackMessage);
  }
  assertTaskScopeActive(options.scope);
  const script = await syncRemoteScriptDetailToLocal(scriptId, { scope: options.scope });
  markScriptsStale();
  await forgetPendingScriptPipelineTask(options.scope.userId, pipelineRunId);
  return script;
}
