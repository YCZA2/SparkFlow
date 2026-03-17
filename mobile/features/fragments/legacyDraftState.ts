import { extractPlainTextFromHtml } from '@/features/editor/html';
import type {
  Fragment,
  LegacyLocalFragmentDraft,
  LocalPendingImageAsset,
  MediaAsset,
} from '@/types/fragment';

function mergeVisibleMediaAssets(
  baselineMediaAssets: MediaAsset[] | null | undefined,
  pendingImageAssets: LocalPendingImageAsset[] | null | undefined
): MediaAsset[] {
  /*详情可见素材同时承接基线资产和本地待上传图片。 */
  const merged = [...(baselineMediaAssets ?? [])];
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

/*把 legacy 草稿和基线详情合成为统一列表/详情展示模型。 */
export function buildFragmentFromLegacyDraft(
  draft: LegacyLocalFragmentDraft,
  baselineFragment?: Fragment | null
): Fragment {
  const baseline = baselineFragment ?? null;

  return {
    id: draft.id,
    server_id: draft.server_id ?? null,
    sync_status: draft.sync_status,
    audio_file_url: baseline?.audio_file_url ?? null,
    audio_file_expires_at: baseline?.audio_file_expires_at,
    transcript: baseline?.transcript ?? null,
    speaker_segments: baseline?.speaker_segments ?? null,
    summary: baseline?.summary ?? null,
    tags: baseline?.tags ?? null,
    source: 'manual',
    audio_source: baseline?.audio_source ?? null,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    folder_id: draft.folder_id ?? baseline?.folder_id ?? null,
    folder: baseline?.folder ?? null,
    body_html: draft.body_html,
    plain_text_snapshot: draft.plain_text_snapshot || extractPlainTextFromHtml(draft.body_html),
    content_state: draft.body_html.trim() ? 'body_present' : baseline?.content_state ?? 'empty',
    media_assets: mergeVisibleMediaAssets(baseline?.media_assets, draft.pending_image_assets),
  };
}

/*合并 legacy 草稿和已存储碎片列表，按 server_id 去重并保持倒序。 */
export function mergeLegacyDraftsIntoFragments(
  storedFragments: Fragment[],
  drafts: LegacyLocalFragmentDraft[],
  baselineFragmentById?: Map<string, Fragment>
): Fragment[] {
  const localFragments = drafts.map((draft) =>
    buildFragmentFromLegacyDraft(
      draft,
      draft.server_id ? baselineFragmentById?.get(draft.server_id) ?? null : null
    )
  );

  const boundServerIds = new Set(
    drafts.map((item) => item.server_id).filter((value): value is string => Boolean(value))
  );

  const merged = [
    ...localFragments,
    ...storedFragments.filter((item) => {
      if (boundServerIds.has(item.id)) return false;
      return true;
    }),
  ];
  return merged.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
}

/*失败后按指数退避重排队，避免离线时持续打接口。 */
export function resolveRetryDelayMs(retryCount: number): number {
  return Math.min(2000 * 2 ** Math.max(retryCount, 0), 60000);
}
