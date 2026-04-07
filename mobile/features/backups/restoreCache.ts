import {
  downloadRemoteFileToFragment,
} from '@/features/core/files/runtime';

import { refreshBackupAssetAccess } from './api';
import type { BackupRestorePlan, RestoredFragmentRow, RestoredMediaAssetRow } from './restoreState';

function resolveManagedFileKind(mediaKind: RestoredMediaAssetRow['mediaKind']) {
  /*把备份里的媒体类型映射为本地文件 runtime 所需的 kind。 */
  if (mediaKind === 'image') {
    return 'image' as const;
  }
  if (mediaKind === 'audio') {
    return 'audio' as const;
  }
  return 'text' as const;
}

async function hydrateFragmentAudioCache(fragment: RestoredFragmentRow): Promise<void> {
  /*恢复时尽量把远端音频镜像到本地，失败时保留远端 URL 继续可用。 */
  if (fragment.deletedAt || !fragment.audioFileUrl) {
    return;
  }

  try {
    const cached = await downloadRemoteFileToFragment({
      fragmentId: fragment.id,
      url: fragment.audioFileUrl,
      fileName: `${fragment.id}.m4a`,
      kind: 'audio',
      mimeType: 'audio/m4a',
    });
    fragment.audioFileUri = cached.uri;
  } catch (error) {
    console.warn('恢复音频本地缓存失败:', fragment.id, error);
  }
}

export async function refreshFragmentAudioAccess(plan: BackupRestorePlan): Promise<void> {
  /*恢复前刷新 fragment 音频的最新访问地址，避免旧签名过期。 */
  const objectKeys = Array.from(
    new Set(
      plan.fragments
        .filter((fragment) => !fragment.deletedAt && fragment.audioObjectKey)
        .map((fragment) => fragment.audioObjectKey as string)
    )
  );
  if (objectKeys.length === 0) {
    return;
  }

  try {
    const response = await refreshBackupAssetAccess(objectKeys);
    const accessByObjectKey = new Map(
      response.items.map((item) => [item.object_key, item] as const)
    );
    for (const fragment of plan.fragments) {
      if (!fragment.audioObjectKey) {
        continue;
      }
      const refreshed = accessByObjectKey.get(fragment.audioObjectKey);
      if (!refreshed) {
        continue;
      }
      fragment.audioFileUrl = refreshed.file_url;
      fragment.audioFileExpiresAt = refreshed.expires_at;
    }
  } catch (error) {
    console.warn('刷新 fragment 音频访问地址失败，恢复将回退到旧 URL:', error);
  }
}

export async function refreshBackupMediaAssetUrls(plan: BackupRestorePlan): Promise<void> {
  /*恢复前先批量换取新的签名 URL，避免直接消费旧 snapshot 里的过期地址。 */
  const objectKeys = Array.from(
    new Set(
      plan.mediaAssets
        .filter((asset) => !asset.deletedAt && asset.remoteAssetId)
        .map((asset) => asset.remoteAssetId as string)
    )
  );
  if (objectKeys.length === 0) {
    return;
  }

  try {
    const response = await refreshBackupAssetAccess(objectKeys);
    const accessByObjectKey = new Map(
      response.items.map((item) => [item.object_key, item] as const)
    );
    for (const asset of plan.mediaAssets) {
      if (!asset.remoteAssetId) {
        continue;
      }
      const refreshed = accessByObjectKey.get(asset.remoteAssetId);
      if (!refreshed) {
        continue;
      }
      asset.remoteFileUrl = refreshed.file_url;
      asset.remoteExpiresAt = refreshed.expires_at;
    }
  } catch (error) {
    console.warn('刷新备份素材访问地址失败，恢复将回退到旧 URL:', error);
  }
}

async function hydrateMediaAssetCache(asset: RestoredMediaAssetRow): Promise<void> {
  /*恢复时尽量把媒体资源下载回本地，便于离线继续编辑和预览。 */
  if (asset.deletedAt || !asset.remoteFileUrl || asset.fragmentId === '__deleted_fragment__') {
    return;
  }

  try {
    const cached = await downloadRemoteFileToFragment({
      fragmentId: asset.fragmentId,
      url: asset.remoteFileUrl,
      fileName: asset.fileName,
      kind: resolveManagedFileKind(asset.mediaKind),
      mimeType: asset.mimeType,
    });
    asset.localFileUri = cached.uri;
  } catch (error) {
    console.warn('恢复媒体本地缓存失败:', asset.id, error);
  }
}

export async function hydrateBackupFileCache(plan: BackupRestorePlan): Promise<void> {
  /*批量拉取恢复后的远端文件缓存，但不让单个文件失败阻断整次恢复。 */
  await Promise.all([
    ...plan.fragments.map(async (fragment) => {
      await hydrateFragmentAudioCache(fragment);
    }),
    ...plan.mediaAssets.map(async (asset) => {
      await hydrateMediaAssetCache(asset);
    }),
  ]);
}
