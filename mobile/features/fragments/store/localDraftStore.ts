import { eq } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import { deleteFileIfExists, getFragmentBodyFile } from '@/features/core/files/runtime';
import { extractPlainTextFromHtml } from '@/features/editor/html';
import type {
  LocalFragmentDraft,
  LocalFragmentSyncStatus,
  LocalPendingImageAsset,
} from '@/types/fragment';

import {
  buildLocalDraftRowPatch,
  detailMemoryCache,
  emitFragmentStoreChange,
  generateLocalId,
  isLocalFragmentId,
  loadFragmentRowByIdOrRemoteId,
  loadMediaRowsByFragmentIds,
  LOCAL_FRAGMENT_ID_PREFIX,
  LOCAL_IMAGE_ASSET_ID_PREFIX,
  mapLocalDraftRow,
  persistBodyHtml,
  readFragmentRows,
  stagePendingImage,
} from './shared';
import { subscribeFragmentStore } from './remoteFragments';

export { isLocalFragmentId };

/*把本地镜像变更广播给列表与详情，让上层继续复用订阅接口。 */
export function subscribeLocalFragmentDrafts(listener: () => void): () => void {
  return subscribeFragmentStore(listener);
}

/*创建新的本地 manual fragment，并立即返回可进入编辑器的草稿结构。 */
export async function createLocalFragmentDraft(
  folderId?: string | null
): Promise<LocalFragmentDraft> {
  const database = await getLocalDatabase();
  const localId = generateLocalId(LOCAL_FRAGMENT_ID_PREFIX);
  const createdAt = new Date().toISOString();
  await persistBodyHtml(localId, '');
  await database.insert(fragmentsTable).values({
    id: localId,
    remoteId: null,
    folderId: folderId ?? null,
    source: 'manual',
    audioSource: null,
    createdAt,
    updatedAt: createdAt,
    summary: null,
    tagsJson: '[]',
    plainTextSnapshot: '',
    bodyFileUri: getFragmentBodyFile(localId).uri,
    transcript: null,
    speakerSegmentsJson: null,
    audioFileUri: null,
    audioFileUrl: null,
    audioFileExpiresAt: null,
    syncStatus: 'local_only',
    remoteSyncState: 'idle',
    lastSyncedAt: null,
    lastRemoteVersion: null,
    lastSyncAttemptAt: null,
    nextRetryAt: null,
    retryCount: 0,
    deletedAt: null,
    isLocalDraft: 1,
    localSyncStatus: 'creating',
    displaySourceLabel: '本地草稿',
    contentState: 'empty',
    cachedAt: createdAt,
  });
  emitFragmentStoreChange();
  return (await loadLocalFragmentDraft(localId)) as LocalFragmentDraft;
}

/*按 local_id 读取本地草稿镜像，并补齐待上传图片列表。 */
export async function loadLocalFragmentDraft(localId: string): Promise<LocalFragmentDraft | null> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(eq(fragmentsTable.id, localId))
    .limit(1);
  const row = rows[0];
  if (!row || row.isLocalDraft !== 1) {
    return null;
  }
  const mediaRows = await loadMediaRowsByFragmentIds([localId]);
  return await mapLocalDraftRow(row, mediaRows.get(localId) ?? []);
}

/*读取首页或文件夹页范围内的本地草稿，并保持创建时间倒序。 */
export async function listLocalFragmentDrafts(
  folderId?: string | null
): Promise<LocalFragmentDraft[]> {
  const rows = await readFragmentRows(folderId, true);
  const mediaRowsByFragmentId = await loadMediaRowsByFragmentIds(rows.map((row) => row.id));
  return await Promise.all(
    rows.map(async (row) => await mapLocalDraftRow(row, mediaRowsByFragmentId.get(row.id) ?? []))
  );
}

/*按补丁保存本地草稿，让正文与待上传图片都落到本地镜像中。 */
export async function saveLocalFragmentDraft(
  localId: string,
  patch: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  const database = await getLocalDatabase();
  const current = await loadFragmentRowByIdOrRemoteId(localId);
  if (!current || current.isLocalDraft !== 1) {
    return null;
  }

  if (typeof patch.body_html === 'string') {
    const normalizedHtml = await persistBodyHtml(localId, patch.body_html);
    patch.plain_text_snapshot = extractPlainTextFromHtml(normalizedHtml);
  }

  await database
    .update(fragmentsTable)
    .set(buildLocalDraftRowPatch(current, patch))
    .where(eq(fragmentsTable.id, localId));

  if (patch.pending_image_assets) {
    const existingRows = await database
      .select()
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.fragmentId, localId));
    const nextIds = new Set(patch.pending_image_assets.map((asset) => asset.local_asset_id));
    await Promise.all(
      existingRows
        .filter((row) => !nextIds.has(row.id))
        .map((row) => database.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, row.id)))
    );
    for (const asset of patch.pending_image_assets) {
      await database
        .insert(mediaAssetsTable)
        .values({
          id: asset.local_asset_id,
          fragmentId: localId,
          remoteAssetId: asset.remote_asset_id ?? null,
          mediaKind: 'image',
          mimeType: asset.mime_type,
          fileName: asset.file_name,
          localFileUri: asset.local_uri,
          remoteFileUrl: null,
          remoteExpiresAt: null,
          uploadStatus: asset.upload_status,
          fileSize: 0,
          checksum: null,
          width: null,
          height: null,
          durationMs: null,
          status: asset.upload_status,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: mediaAssetsTable.id,
          set: {
            remoteAssetId: asset.remote_asset_id ?? null,
            mimeType: asset.mime_type,
            fileName: asset.file_name,
            localFileUri: asset.local_uri,
            uploadStatus: asset.upload_status,
            status: asset.upload_status,
          },
        });
    }
  }

  emitFragmentStoreChange();
  return await loadLocalFragmentDraft(localId);
}

/*删除本地草稿镜像，并同步回收关联待上传素材。 */
export async function deleteLocalFragmentDraft(localId: string): Promise<void> {
  const database = await getLocalDatabase();
  await database.delete(mediaAssetsTable).where(eq(mediaAssetsTable.fragmentId, localId));
  await database.delete(fragmentsTable).where(eq(fragmentsTable.id, localId));
  await deleteFileIfExists(getFragmentBodyFile(localId));
  detailMemoryCache.delete(localId);
  emitFragmentStoreChange();
}

/*回填本地草稿绑定的 remote_id，维持去重和跳详情的主键映射。 */
export async function bindRemoteFragmentId(
  localId: string,
  remoteId: string
): Promise<LocalFragmentDraft | null> {
  return await saveLocalFragmentDraft(localId, {
    remote_id: remoteId,
    sync_status: 'syncing',
  });
}

/*统一更新本地草稿同步状态，供 UI 与重试逻辑消费同一份真值。 */
export async function updateLocalFragmentSyncState(
  localId: string,
  syncStatus: LocalFragmentSyncStatus,
  patch?: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  return await saveLocalFragmentDraft(localId, {
    ...patch,
    sync_status: syncStatus,
  });
}

/*把新选中的本地图片登记为待上传素材，并返回新的本地 asset 句柄。 */
export async function attachPendingLocalImage(
  localFragmentId: string,
  payload: Pick<LocalPendingImageAsset, 'local_uri' | 'mime_type' | 'file_name'>
): Promise<LocalPendingImageAsset | null> {
  const draft = await loadLocalFragmentDraft(localFragmentId);
  if (!draft) {
    return null;
  }
  const stagedFile = await stagePendingImage(payload.local_uri, payload.file_name, payload.mime_type);
  const pendingAsset: LocalPendingImageAsset = {
    local_asset_id: generateLocalId(LOCAL_IMAGE_ASSET_ID_PREFIX),
    local_fragment_id: localFragmentId,
    local_uri: stagedFile.uri,
    mime_type: payload.mime_type,
    file_name: payload.file_name,
    remote_asset_id: null,
    upload_status: 'pending',
  };
  await saveLocalFragmentDraft(localFragmentId, {
    pending_image_assets: [...(draft.pending_image_assets ?? []), pendingAsset],
  });
  return pendingAsset;
}

/*回填待上传图片的上传状态与远端 asset id。 */
export async function markPendingImageUploaded(
  localFragmentId: string,
  localAssetId: string,
  patch: Pick<LocalPendingImageAsset, 'remote_asset_id' | 'upload_status'>
): Promise<LocalFragmentDraft | null> {
  const draft = await loadLocalFragmentDraft(localFragmentId);
  if (!draft) {
    return null;
  }
  return await saveLocalFragmentDraft(localFragmentId, {
    pending_image_assets: (draft.pending_image_assets ?? []).map((asset) =>
      asset.local_asset_id === localAssetId ? { ...asset, ...patch } : asset
    ),
  });
}
