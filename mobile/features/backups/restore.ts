import { fragmentFoldersTable, fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import { getLocalDatabase } from '@/features/core/db/database';
import {
  downloadRemoteFileToFragment,
  getFragmentBodyFile,
  getScriptBodyFile,
  resetFragmentFiles,
  writeFragmentBodyFile,
} from '@/features/core/files/runtime';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { useFragmentStore } from '@/features/fragments/store/fragmentStore';
import { ensureFragmentStoreReady } from '@/features/fragments/store/runtime';
import { markScriptsStale } from '@/features/scripts/refreshSignal';
import { useScriptStore } from '@/features/scripts/store/scriptStore';
import { mergeRestoredScriptRow } from '@/features/scripts/store';

import { createRestoreSession, fetchBackupSnapshot, refreshBackupAssetAccess } from './api';
import {
  buildBackupRestorePlan,
  type BackupRestorePlan,
  type RestoredFragmentRow,
  type RestoredMediaAssetRow,
  type RestoredScriptRow,
} from './restoreState';

export interface BackupRestoreResult {
  restoreSessionId: string;
  fragmentCount: number;
  folderCount: number;
  mediaAssetCount: number;
  scriptCount: number;
  snapshotGeneratedAt: string;
}

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

async function refreshFragmentAudioAccess(plan: BackupRestorePlan): Promise<void> {
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

async function refreshBackupMediaAssetUrls(plan: BackupRestorePlan): Promise<void> {
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

async function hydrateBackupFileCache(plan: BackupRestorePlan): Promise<void> {
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

async function mergeRestoredScripts(plan: BackupRestorePlan): Promise<void> {
  /*script 恢复按“现存本地 > 远端快照 > 回收站”规则合并，不粗暴覆盖本地稿。 */
  for (const script of plan.scripts) {
    const bodyHtml = script.deletedAt ? '' : script.bodyHtml;
    await mergeRestoredScriptRow({
      row: {
        id: script.id,
        title: script.title,
        mode: script.mode,
        generationKind: script.generationKind,
        sourceFragmentIdsJson: script.sourceFragmentIdsJson,
        isDailyPush: script.isDailyPush,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt,
        generatedAt: script.generatedAt,
        plainTextSnapshot: script.plainTextSnapshot,
        bodyFileUri: script.deletedAt ? null : getScriptBodyFile(script.id).uri,
        isFilmed: script.isFilmed,
        filmedAt: script.filmedAt,
        copyOfScriptId: script.copyOfScriptId,
        copyReason: script.copyReason,
        trashedAt: script.trashedAt,
        deletedAt: script.deletedAt,
        backupStatus: script.backupStatus,
        lastBackupAt: script.lastBackupAt,
        entityVersion: script.entityVersion,
        lastModifiedDeviceId: script.lastModifiedDeviceId,
        cachedAt: script.cachedAt,
      },
      bodyHtml,
      lastModifiedDeviceId: script.lastModifiedDeviceId,
    });
  }
}

/*用远端备份快照覆盖本地 SQLite 与正文文件，显式完成一次恢复流程。 */
export async function restoreFromBackup(reason?: string): Promise<BackupRestoreResult> {
  await ensureFragmentStoreReady();

  const restoreSession = await createRestoreSession(reason);
  const snapshot = await fetchBackupSnapshot();
  const plan = buildBackupRestorePlan(snapshot);
  const database = await getLocalDatabase();

  await resetFragmentFiles();
  await refreshFragmentAudioAccess(plan);
  await refreshBackupMediaAssetUrls(plan);
  await hydrateBackupFileCache(plan);

  // 用事务原子替换本地数据：DELETE 和 INSERT 要么全成功，要么全回滚，避免崩溃后数据为空。
  await database.transaction(async (tx) => {
    await tx.delete(mediaAssetsTable);
    await tx.delete(fragmentsTable);
    await tx.delete(fragmentFoldersTable);

    if (plan.folders.length > 0) {
      await tx.insert(fragmentFoldersTable).values(plan.folders);
    }

    if (plan.fragments.length > 0) {
      await tx.insert(fragmentsTable).values(
        plan.fragments.map((fragment) => ({
          id: fragment.id,
          legacyServerBindingId: fragment.legacyServerBindingId,
          folderId: fragment.folderId,
          source: fragment.source,
          audioSource: fragment.audioSource,
          createdAt: fragment.createdAt,
          updatedAt: fragment.updatedAt,
          summary: fragment.summary,
          tagsJson: fragment.tagsJson,
          plainTextSnapshot: fragment.plainTextSnapshot,
          bodyFileUri: fragment.deletedAt ? null : getFragmentBodyFile(fragment.id).uri,
          transcript: fragment.transcript,
          speakerSegmentsJson: fragment.speakerSegmentsJson,
          audioObjectKey: fragment.audioObjectKey,
          audioFileUri: fragment.audioFileUri,
          audioFileUrl: fragment.audioFileUrl,
          audioFileExpiresAt: fragment.audioFileExpiresAt,
          legacyCloudBindingStatus: fragment.legacyCloudBindingStatus,
          lastSyncedAt: fragment.lastSyncedAt,
          lastSyncAttemptAt: fragment.lastSyncAttemptAt,
          nextRetryAt: fragment.nextRetryAt,
          retryCount: fragment.retryCount,
          deletedAt: fragment.deletedAt,
          isFilmed: fragment.isFilmed,
          filmedAt: fragment.filmedAt,
          backupStatus: fragment.backupStatus,
          lastBackupAt: fragment.lastBackupAt,
          entityVersion: fragment.entityVersion,
          lastModifiedDeviceId: fragment.lastModifiedDeviceId,
          contentState: fragment.contentState,
          cachedAt: fragment.cachedAt,
        }))
      );
    }

    if (plan.mediaAssets.length > 0) {
      await tx.insert(mediaAssetsTable).values(plan.mediaAssets);
    }
  });

  // 事务提交后再写正文文件：SQLite 行已存在，文件写失败只影响正文展示，不会导致数据行丢失。
  for (const fragment of plan.fragments) {
    if (fragment.deletedAt || !fragment.bodyHtml.trim()) {
      continue;
    }
    await writeFragmentBodyFile(fragment.id, fragment.bodyHtml);
  }

  await mergeRestoredScripts(plan);

  useFragmentStore.getState().clearCache();
  useScriptStore.getState().clearCache();
  markFragmentsStale();
  markScriptsStale();

  return {
    restoreSessionId: restoreSession.restore_session_id,
    fragmentCount: plan.fragments.filter((item) => !item.deletedAt).length,
    folderCount: plan.folders.filter((item) => !item.deletedAt).length,
    mediaAssetCount: plan.mediaAssets.filter((item) => !item.deletedAt).length,
    scriptCount: plan.scripts.filter((item) => !item.deletedAt && !item.trashedAt).length,
    snapshotGeneratedAt: snapshot.server_generated_at,
  };
}
