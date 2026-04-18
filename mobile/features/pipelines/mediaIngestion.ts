import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { readLocalFragmentEntity, updateLocalFragmentEntity } from '@/features/fragments/store';
import type { Fragment } from '@/types/fragment';
import type { TaskRun } from '@/types/task';

export {
  extractMediaIngestionOutput,
  resolveMediaIngestionFragmentPatch,
  resolveMediaIngestionFragmentId,
} from './mediaIngestionState';
import {
  extractMediaIngestionOutput,
  resolveMediaIngestionFragmentPatch,
  resolveMediaIngestionFragmentId,
} from './mediaIngestionState';

/*把媒体导入 pipeline 的终态结果回写到本地真值 fragment。 */
export async function applyMediaIngestionPipelineResult(
  fallbackFragmentId: string,
  pipeline: Pick<TaskRun, 'status' | 'resource' | 'output'>
): Promise<Fragment | null> {
  if (pipeline.status !== 'succeeded') {
    return null;
  }

  const fragmentId = resolveMediaIngestionFragmentId(fallbackFragmentId, pipeline);
  if (!fragmentId) {
    return null;
  }

  const current = await readLocalFragmentEntity(fragmentId);
  const output = extractMediaIngestionOutput(pipeline);
  const patch = resolveMediaIngestionFragmentPatch({ current, output });

  const nextFragment = await updateLocalFragmentEntity(fragmentId, patch);

  markFragmentsStale();
  return nextFragment;
}
