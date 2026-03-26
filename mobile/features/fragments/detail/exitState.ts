import { hasMeaningfulBody } from '@/features/editor/sessionUtils';
import type { EditorDocumentSnapshot, EditorMediaAsset } from '@/features/editor/types';
import type { Fragment } from '@/types/fragment';

interface ResolveFragmentExitBehaviorInput {
  fragment: Fragment | null;
  snapshot: EditorDocumentSnapshot | null;
  mediaAssets?: EditorMediaAsset[] | null;
}

/*判断 manual 占位碎片在退出时是否仍然完全空白，命中后应直接删除而不是保留到列表。 */
export function shouldDeleteEmptyManualFragmentOnExit(
  input: ResolveFragmentExitBehaviorInput
): boolean {
  const fragment = input.fragment;
  if (!fragment || fragment.source !== 'manual') {
    return false;
  }

  const snapshot = input.snapshot;
  const bodyHtml = snapshot?.body_html ?? fragment.body_html ?? '';
  const hasTextBody = hasMeaningfulBody(bodyHtml);
  const hasSnapshotAssets = (snapshot?.asset_ids?.length ?? 0) > 0;
  const hasMediaAssets = (input.mediaAssets?.length ?? fragment.media_assets?.length ?? 0) > 0;
  const hasTranscript = Boolean(String(fragment.transcript ?? '').trim());
  const hasSummary = Boolean(String(fragment.summary ?? '').trim());
  const hasTags = (fragment.tags?.length ?? 0) > 0;
  const hasAudio = Boolean(fragment.audio_file_url || fragment.audio_object_key);

  return !hasTextBody && !hasSnapshotAssets && !hasMediaAssets && !hasTranscript && !hasSummary && !hasTags && !hasAudio;
}
