import { extractPlainTextFromHtml } from '@/features/editor/html';
import type {
  Fragment,
  LocalFragmentDraft,
  LocalPendingImageAsset,
  MediaAsset,
} from '@/types/fragment';

function mergeVisibleMediaAssets(
  remoteMediaAssets: MediaAsset[] | null | undefined,
  pendingImageAssets: LocalPendingImageAsset[] | null | undefined
): MediaAsset[] {
  /*详情可见素材同时承接远端资产和本地待上传图片。 */
  const merged = [...(remoteMediaAssets ?? [])];
  for (const asset of pendingImageAssets ?? []) {
    if (asset.upload_status === 'uploaded' && asset.remote_asset_id) continue;
    merged.push({
      id: asset.local_asset_id,
      media_kind: 'image',
      original_filename: asset.file_name,
      mime_type: asset.mime_type,
      file_size: 0,
      checksum: null,
      width: null,
      height: null,
      duration_ms: null,
      status: asset.upload_status,
      created_at: null,
      file_url: asset.local_uri,
      expires_at: null,
    });
  }
  return merged;
}

export function buildFragmentFromLocalDraft(
  draft: LocalFragmentDraft,
  remoteFragment?: Fragment | null
): Fragment {
  /*把本地草稿和远端详情合成为统一列表/详情展示模型。 */
  const remote = remoteFragment ?? null;
  return {
    id: draft.local_id,
    local_id: draft.local_id,
    remote_id: draft.remote_id ?? null,
    is_local_draft: true,
    local_sync_status: draft.sync_status,
    display_source_label: '本地草稿',
    audio_file_url: remote?.audio_file_url ?? null,
    audio_file_expires_at: remote?.audio_file_expires_at,
    transcript: remote?.transcript ?? null,
    speaker_segments: remote?.speaker_segments ?? null,
    summary: remote?.summary ?? null,
    tags: remote?.tags ?? null,
    source: 'manual',
    audio_source: remote?.audio_source ?? null,
    created_at: draft.created_at,
    folder_id: draft.folder_id ?? remote?.folder_id ?? null,
    folder: remote?.folder ?? null,
    body_html: draft.body_html,
    plain_text_snapshot: draft.plain_text_snapshot || extractPlainTextFromHtml(draft.body_html),
    content_state: draft.body_html.trim() ? 'body_present' : remote?.content_state ?? 'empty',
    media_assets: mergeVisibleMediaAssets(remote?.media_assets, draft.pending_image_assets),
  };
}

export function mergeLocalDraftsIntoFragments(
  remoteFragments: Fragment[],
  drafts: LocalFragmentDraft[],
  remoteFragmentById?: Map<string, Fragment>
): Fragment[] {
  /*列表先叠加本地草稿，再按 remote_id 去重，避免同一内容出现两张卡片。 */
  const localFragments = drafts.map((draft) =>
    buildFragmentFromLocalDraft(draft, draft.remote_id ? remoteFragmentById?.get(draft.remote_id) ?? null : null)
  );
  const boundRemoteIds = new Set(
    drafts.map((item) => item.remote_id).filter((value): value is string => Boolean(value))
  );
  const merged = [
    ...localFragments,
    ...remoteFragments.filter((item) => !boundRemoteIds.has(item.id)),
  ];
  return merged.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
}

export function resolveRetryDelayMs(retryCount: number): number {
  /*失败后按指数退避重排队，避免离线时持续打接口。 */
  return Math.min(2000 * 2 ** Math.max(retryCount, 0), 60000);
}
