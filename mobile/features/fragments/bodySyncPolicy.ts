import { normalizeBodyHtml } from '@/features/editor/html';
import type { EditorDocumentSnapshot } from '@/features/editor/types';
import type {
  Fragment,
  LegacyLocalFragmentDraft,
  LegacyCloudBindingStatus,
  MediaAsset,
} from '@/types/fragment';

function collectMediaAssetIds(mediaAssets: MediaAsset[] | null | undefined): string[] {
  /*统一按可见素材 id 比较基线与本地差异，避免图片顺序变化被吞掉。 */
  return (mediaAssets ?? []).map((asset) => asset.id);
}

function areAssetIdsEqual(left: string[], right: string[]): boolean {
  /*素材列表按顺序比较，保证“是否需要上云”判断稳定可预测。 */
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/*只在正文或素材真正偏离兼容云端基线时，才允许触发补传。 */
export function shouldTriggerLegacyCloudSync(input: {
  fragment: Fragment;
  snapshot: EditorDocumentSnapshot;
  mediaAssets: MediaAsset[];
  baselineBodyHtml?: string | null;
  baselineMediaAssets?: MediaAsset[] | null;
}): boolean {
  const baselineBodyHtml = normalizeBodyHtml(input.baselineBodyHtml ?? input.fragment.body_html);
  const bodyChanged = normalizeBodyHtml(input.snapshot.body_html) !== baselineBodyHtml;
  const currentAssetIds = collectMediaAssetIds(input.mediaAssets);
  const baselineAssetIds = collectMediaAssetIds(
    input.baselineMediaAssets ?? input.fragment.media_assets ?? []
  );
  const mediaChanged = !areAssetIdsEqual(currentAssetIds, baselineAssetIds);

  return bodyChanged || mediaChanged;
}

/*本地保存时返回兼容云端绑定字段需要的状态。 */
export function resolveLegacyCloudBindingPersistStatus(input: {
  fragment: Fragment;
  queueRemote: boolean;
}): LegacyCloudBindingStatus {
  if (input.queueRemote) {
    return 'pending';
  }

  return input.fragment.sync_status ?? 'pending';
}

/*应用重启后只恢复已进入兼容同步阶段的 legacy 草稿。 */
export function shouldRestoreLegacyDraftOnLaunch(draft: LegacyLocalFragmentDraft): boolean {
  return Boolean(
    draft.next_retry_at ||
    (draft.pending_image_assets ?? []).some((asset) => asset.upload_status !== 'uploaded') ||
    (draft.last_sync_attempt_at && draft.sync_status === 'pending')
  );
}
