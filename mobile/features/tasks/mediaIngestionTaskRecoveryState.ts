import type { Fragment } from '@/types/fragment';

function isMediaFragment(fragment: Pick<Fragment, 'source' | 'audio_source'>): boolean {
  return fragment.source === 'voice' || fragment.audio_source === 'external_link';
}

export function isFailedMediaIngestionFragment(
  fragment: Pick<
    Fragment,
    'source' | 'audio_source' | 'media_pipeline_run_id' | 'media_pipeline_status'
  >
): boolean {
  /*只有媒体导入类碎片且已有失败 run_id 时，才允许列表刷新触发重试。 */
  return (
    isMediaFragment(fragment) &&
    Boolean(fragment.media_pipeline_run_id) &&
    fragment.media_pipeline_status === 'failed'
  );
}

export function isProcessingMediaIngestionFragment(
  fragment: Pick<
    Fragment,
    | 'source'
    | 'audio_source'
    | 'plain_text_snapshot'
    | 'transcript'
    | 'media_pipeline_status'
    | 'media_pipeline_run_id'
  >
): boolean {
  /*媒体 placeholder 在正文未回写前，优先按本地 pipeline 状态展示处理中。 */
  const body = (fragment.plain_text_snapshot ?? '').trim();
  const transcript = (fragment.transcript ?? '').trim();
  if (body || transcript) {
    return false;
  }
  if (!isMediaFragment(fragment)) {
    return false;
  }
  return (
    fragment.media_pipeline_status === 'queued' ||
    fragment.media_pipeline_status === 'running' ||
    (Boolean(fragment.media_pipeline_run_id) && !fragment.media_pipeline_status)
  );
}
