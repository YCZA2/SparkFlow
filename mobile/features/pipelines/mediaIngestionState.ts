import type { SpeakerSegment } from '@/types/fragment';
import type { PipelineRun } from '@/types/script';

export interface MediaIngestionOutput {
  transcript: string | null;
  summary: string | null;
  tags: string[] | null;
  speaker_segments: SpeakerSegment[] | null;
  audio_object_key: string | null;
  audio_file_url: string | null;
  audio_file_expires_at: string | null;
}

/*把 pipeline output 规整成可直接回写本地 fragment 的 patch 数据。 */
export function extractMediaIngestionOutput(
  pipeline: Pick<PipelineRun, 'output'>
): MediaIngestionOutput {
  const output = (pipeline.output ?? {}) as Record<string, unknown>;
  const rawTags = output.tags;
  const rawSegments = output.speaker_segments;
  const rawAudioFile =
    typeof output.audio_file === 'object' && output.audio_file !== null
      ? (output.audio_file as Record<string, unknown>)
      : null;

  return {
    transcript: typeof output.transcript === 'string' ? output.transcript : null,
    summary: typeof output.summary === 'string' ? output.summary : null,
    tags:
      Array.isArray(rawTags) && rawTags.every((item) => typeof item === 'string')
        ? rawTags
        : null,
    speaker_segments:
      Array.isArray(rawSegments) &&
      rawSegments.every(
        (segment) =>
          typeof segment === 'object' &&
          segment !== null &&
          typeof (segment as Record<string, unknown>).speaker_id === 'string'
      )
        ? (rawSegments as SpeakerSegment[])
        : null,
    audio_object_key:
      typeof output.audio_object_key === 'string'
        ? output.audio_object_key
        : typeof rawAudioFile?.object_key === 'string'
          ? rawAudioFile.object_key
          : null,
    audio_file_url: typeof output.audio_file_url === 'string' ? output.audio_file_url : null,
    audio_file_expires_at:
      typeof output.audio_file_expires_at === 'string' ? output.audio_file_expires_at : null,
  };
}

/*解析媒体导入最终对应的本地 fragment id，优先取 pipeline 终态资源。 */
export function resolveMediaIngestionFragmentId(
  fallbackFragmentId: string,
  pipeline: Pick<PipelineRun, 'status' | 'resource'>
): string | null {
  if (
    pipeline.status === 'succeeded' &&
    (pipeline.resource?.resource_type === 'local_fragment' ||
      pipeline.resource?.resource_type === 'fragment') &&
    pipeline.resource.resource_id
  ) {
    return pipeline.resource.resource_id;
  }

  return fallbackFragmentId || null;
}
