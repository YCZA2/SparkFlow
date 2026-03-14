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

/*把本地草稿和远端详情合成为统一列表/详情展示模型。 */
export function buildFragmentFromLocalDraft(
  draft: LocalFragmentDraft,
  remoteFragment?: Fragment | null
): Fragment {
  const remote = remoteFragment ?? null;

  return {
    id: draft.id,
    server_id: draft.server_id ?? null,
    sync_status: draft.sync_status,
    audio_file_url: remote?.audio_file_url ?? null,
    audio_file_expires_at: remote?.audio_file_expires_at,
    transcript: remote?.transcript ?? null,
    speaker_segments: remote?.speaker_segments ?? null,
    summary: remote?.summary ?? null,
    tags: remote?.tags ?? null,
    source: 'manual',
    audio_source: remote?.audio_source ?? null,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    folder_id: draft.folder_id ?? remote?.folder_id ?? null,
    folder: remote?.folder ?? null,
    body_html: draft.body_html,
    plain_text_snapshot: draft.plain_text_snapshot || extractPlainTextFromHtml(draft.body_html),
    content_state: draft.body_html.trim() ? 'body_present' : remote?.content_state ?? 'empty',
    media_assets: mergeVisibleMediaAssets(remote?.media_assets, draft.pending_image_assets),
  };
}

/*合并本地草稿和远程碎片列表，按 server_id 去重，并按 updated_at 排序。 */
export function mergeLocalDraftsIntoFragments(
  remoteFragments: Fragment[],
  drafts: LocalFragmentDraft[],
  remoteFragmentById?: Map<string, Fragment>
): Fragment[] {
  // 转换本地草稿为 Fragment 展示模型
  const localFragments = drafts.map((draft) =>
    buildFragmentFromLocalDraft(draft, draft.server_id ? remoteFragmentById?.get(draft.server_id) ?? null : null)
  );

  // 已绑定 server_id 的本地草稿对应的远程碎片 ID 集合
  const boundServerIds = new Set(
    drafts.map((item) => item.server_id).filter((value): value is string => Boolean(value))
  );

  const merged = [
    ...localFragments,
    ...remoteFragments.filter((item) => {
      // 过滤掉已绑定到本地草稿的远程碎片
      if (boundServerIds.has(item.id)) return false;
      return true;
    }),
  ];
  // 按 updated_at 倒序排序，编辑后自动上浮
  return merged.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
}

/*失败后按指数退避重排队，避免离线时持续打接口。 */
export function resolveRetryDelayMs(retryCount: number): number {
  return Math.min(2000 * 2 ** Math.max(retryCount, 0), 60000);
}
