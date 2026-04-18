import { assertTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { retryTaskRun, waitForTaskTerminal } from '@/features/tasks/api';
import {
  extractMediaIngestionOutput,
  resolveMediaIngestionFragmentPatch,
} from '@/features/pipelines/mediaIngestionState';
import { readLocalFragmentEntity, updateLocalFragmentEntity } from '@/features/fragments/store';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import type { Fragment } from '@/types/fragment';
import type { TaskRun } from '@/types/task';
export { isFailedMediaIngestionFragment, isProcessingMediaIngestionFragment } from './mediaIngestionRecoveryState';

export async function syncMediaIngestionPipelineState(
  fallbackFragmentId: string,
  pipeline: Pick<TaskRun, 'id' | 'status' | 'resource' | 'output' | 'error_message'>,
  options?: { scope?: TaskExecutionScope | null }
): Promise<Fragment | null> {
  /*统一把媒体 task 终态回写到本地 fragment，成功时补正文，失败时保留错误态。 */
  if (options?.scope) {
    assertTaskScopeActive(options.scope);
  }
  const fragmentId =
    (pipeline.status === 'succeeded' &&
    (pipeline.resource?.resource_type === 'local_fragment' ||
      pipeline.resource?.resource_type === 'fragment') &&
    pipeline.resource.resource_id
      ? pipeline.resource.resource_id
      : fallbackFragmentId) || null;

  if (!fragmentId) {
    return null;
  }

  if (pipeline.status !== 'succeeded') {
    if (options?.scope) {
      assertTaskScopeActive(options.scope);
    }
    const nextFragment = await updateLocalFragmentEntity(fragmentId, {
      media_pipeline_run_id: pipeline.id,
      media_pipeline_status: pipeline.status,
      media_pipeline_error_message: pipeline.error_message ?? null,
    });
    markFragmentsStale();
    return nextFragment;
  }

  if (options?.scope) {
    assertTaskScopeActive(options.scope);
  }
  const current = await readLocalFragmentEntity(fragmentId);
  const output = extractMediaIngestionOutput(pipeline);
  const patch = resolveMediaIngestionFragmentPatch({ current, output });
  const nextFragment = await updateLocalFragmentEntity(fragmentId, {
    ...patch,
    media_pipeline_run_id: pipeline.id,
    media_pipeline_status: pipeline.status,
    media_pipeline_error_message: null,
  });

  markFragmentsStale();
  return nextFragment;
}

export async function retryFailedMediaIngestionFragment(fragment: Pick<Fragment, 'id' | 'media_pipeline_run_id'>) {
  /*列表刷新命中失败态时，直接复用后端 retry 接口重新驱动媒体转写。 */
  const runId = fragment.media_pipeline_run_id?.trim();
  if (!runId) {
    return null;
  }

  await updateLocalFragmentEntity(fragment.id, {
    media_pipeline_status: 'queued',
    media_pipeline_error_message: null,
  });
  const retriedRun = await retryTaskRun(runId, { strategy: 'from_failed_step' });
  await updateLocalFragmentEntity(fragment.id, {
    media_pipeline_run_id: retriedRun.id,
    media_pipeline_status: retriedRun.status,
    media_pipeline_error_message: retriedRun.error_message ?? null,
  });

  const terminalRun = await waitForTaskTerminal(retriedRun.id, { timeoutMs: 180_000 });
  return await syncMediaIngestionPipelineState(fragment.id, terminalRun);
}
