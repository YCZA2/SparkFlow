import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { readLocalFragmentEntity, updateLocalFragmentEntity } from '@/features/fragments/store';
import type { Fragment } from '@/types/fragment';
import type { TaskRun } from '@/types/task';

export {
  extractMediaIngestionOutput,
  resolveMediaIngestionFragmentPatch,
  resolveMediaIngestionFragmentId,
} from './mediaIngestionTaskState';
import {
  extractMediaIngestionOutput,
  resolveMediaIngestionFragmentPatch,
  resolveMediaIngestionFragmentId,
} from './mediaIngestionTaskState';

/*把媒体导入 task 的终态结果回写到本地真值 fragment。 */
export async function applyMediaIngestionTaskResult(
  fallbackFragmentId: string,
  task: Pick<TaskRun, 'status' | 'resource' | 'output'>
): Promise<Fragment | null> {
  if (task.status !== 'succeeded') {
    return null;
  }

  const fragmentId = resolveMediaIngestionFragmentId(fallbackFragmentId, task);
  if (!fragmentId) {
    return null;
  }

  const current = await readLocalFragmentEntity(fragmentId);
  const output = extractMediaIngestionOutput(task);
  const patch = resolveMediaIngestionFragmentPatch({ current, output });

  const nextFragment = await updateLocalFragmentEntity(fragmentId, patch);

  markFragmentsStale();
  return nextFragment;
}
