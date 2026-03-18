import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { readLocalFragmentEntity, updateLocalFragmentEntity } from '@/features/fragments/store';
import type { Fragment } from '@/types/fragment';
import type { PipelineRun } from '@/types/pipeline';

export {
  extractMediaIngestionOutput,
  resolveMediaIngestionFragmentId,
} from './mediaIngestionState';
import {
  extractMediaIngestionOutput,
  resolveMediaIngestionFragmentId,
} from './mediaIngestionState';

/*把媒体导入 pipeline 的终态结果回写到本地真值 fragment。 */
export async function applyMediaIngestionPipelineResult(
  fallbackFragmentId: string,
  pipeline: Pick<PipelineRun, 'status' | 'resource' | 'output'>
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
  const shouldSeedPlainText =
    Boolean(output.transcript?.trim()) && !Boolean(current?.plain_text_snapshot?.trim());
  const shouldPromoteTranscriptState =
    Boolean(output.transcript?.trim()) &&
    !Boolean(current?.body_html?.trim()) &&
    current?.content_state !== 'body_present';

  const nextFragment = await updateLocalFragmentEntity(fragmentId, {
    transcript: output.transcript ?? undefined,
    summary: output.summary ?? undefined,
    tags: output.tags ?? undefined,
    speaker_segments: output.speaker_segments ?? undefined,
    audio_object_key: output.audio_object_key ?? undefined,
    audio_file_url: output.audio_file_url ?? undefined,
    audio_file_expires_at: output.audio_file_expires_at ?? undefined,
    plain_text_snapshot: shouldSeedPlainText ? output.transcript ?? undefined : undefined,
    content_state: shouldPromoteTranscriptState ? 'transcript_only' : undefined,
  });

  markFragmentsStale();
  return nextFragment;
}
