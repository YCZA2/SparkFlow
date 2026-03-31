import { hasMeaningfulBody } from '@/features/editor/sessionUtils';
import type { Fragment } from '@/types/fragment';

/*统一判断 manual 新建占位是否仍然为空白，供返回页决定是否自动清理。 */
export function isEmptyManualPlaceholderFragment(fragment: Fragment | null | undefined): boolean {
  if (!fragment || fragment.source !== 'manual') {
    return false;
  }

  const hasTextBody = hasMeaningfulBody(fragment.body_html);
  const hasMediaAssets = (fragment.media_assets?.length ?? 0) > 0;
  const hasTranscript = Boolean(String(fragment.transcript ?? '').trim());
  const hasSummary = Boolean(String(fragment.summary ?? '').trim());
  const hasTags = (fragment.tags?.length ?? 0) > 0;
  const hasAudio = Boolean(fragment.audio_file_url || fragment.audio_object_key);

  return (
    !hasTextBody &&
    !hasMediaAssets &&
    !hasTranscript &&
    !hasSummary &&
    !hasTags &&
    !hasAudio
  );
}
