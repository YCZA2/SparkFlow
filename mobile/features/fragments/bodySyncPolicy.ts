import { normalizeBodyHtml } from '@/features/editor/html';
import type { EditorDocumentSnapshot } from '@/features/editor/types';
import type {
  Fragment,
  LocalFragmentDraft,
  LocalFragmentSyncStatus,
  MediaAsset,
} from '@/types/fragment';

function collectMediaAssetIds(mediaAssets: MediaAsset[] | null | undefined): string[] {
  /*统一按可见素材 id 比较远端与本地差异，避免图片顺序变化被吞掉。 */
  return (mediaAssets ?? []).map((asset) => asset.id);
}

function areAssetIdsEqual(left: string[], right: string[]): boolean {
  /*素材列表按顺序比较，保证“是否需要上云”判断稳定可预测。 */
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/*只在正文或素材真正偏离远端基线时，才允许触发远端同步。 */
export function shouldTriggerRemoteSync(input: {
  fragment: Fragment;
  snapshot: EditorDocumentSnapshot;
  mediaAssets: MediaAsset[];
  baselineRemoteHtml?: string | null;
  baselineMediaAssets?: MediaAsset[] | null;
}): boolean {
  const baselineRemoteHtml = normalizeBodyHtml(input.baselineRemoteHtml ?? input.fragment.body_html);
  const bodyChanged = normalizeBodyHtml(input.snapshot.body_html) !== baselineRemoteHtml;
  const currentAssetIds = collectMediaAssetIds(input.mediaAssets);
  const baselineAssetIds = collectMediaAssetIds(
    input.baselineMediaAssets ?? input.fragment.media_assets ?? []
  );
  const mediaChanged = !areAssetIdsEqual(currentAssetIds, baselineAssetIds);

  if (bodyChanged || mediaChanged) {
    return true;
  }

  if (!input.fragment.is_local_draft || input.fragment.remote_id) {
    return false;
  }

  return Boolean(input.snapshot.plain_text.trim()) || currentAssetIds.length > 0;
}

/*本地保存时只在真正发起远端收敛前切到 syncing，其余时候保留当前状态。 */
export function resolveLocalDraftPersistStatus(input: {
  fragment: Fragment;
  queueRemote: boolean;
}): LocalFragmentSyncStatus {
  if (input.queueRemote) {
    return input.fragment.remote_id ? 'syncing' : 'creating';
  }

  return input.fragment.local_sync_status ?? (input.fragment.remote_id ? 'synced' : 'creating');
}

/*应用重启后只恢复已明确进入上云阶段或待重试的草稿，避免未离页编辑被偷跑同步。 */
export function shouldRestoreLocalDraftOnLaunch(draft: LocalFragmentDraft): boolean {
  if (draft.sync_status === 'failed_pending_retry') {
    return true;
  }

  if (draft.next_retry_at || draft.last_sync_attempt_at) {
    return true;
  }

  return (draft.pending_image_assets ?? []).some((asset) => asset.upload_status !== 'uploaded');
}
