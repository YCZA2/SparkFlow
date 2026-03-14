import { and, desc, eq, isNull } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import { deleteFileIfExists, getFragmentBodyFile } from '@/features/core/files/runtime';
import { extractPlainTextFromHtml } from '@/features/editor/html';
import type {
  FragmentSyncStatus,
  LocalFragmentDraft,
  LocalPendingImageAsset,
} from '@/types/fragment';

import {
  buildLocalDraftRowPatch,
  generateFragmentId,
  generateLocalImageId,
  loadFragmentRowByIdOrServerId,
  loadMediaRowsByFragmentIds,
  mapLocalDraftRow,
  persistBodyHtml,
  readFragmentRows,
  stagePendingImage,
} from './shared';
import { useFragmentStore } from './fragmentStore';

/*创建新的本地 manual fragment，并立即返回可进入编辑器的草稿结构。 */
export async function createLocalFragmentDraft(
  folderId?: string | null
): Promise<LocalFragmentDraft> {
  const database = await getLocalDatabase();
  const id = generateFragmentId();
  const createdAt = new Date().toISOString();
  await persistBodyHtml(id, '');
  await database.insert(fragmentsTable).values({
    id,
    serverId: null,
    folderId: folderId ?? null,
    source: 'manual',
    audioSource: null,
    createdAt,
    updatedAt: createdAt,
    summary: null,
    tagsJson: '[]',
    plainTextSnapshot: '',
    bodyFileUri: getFragmentBodyFile(id).uri,
    transcript: null,
    speakerSegmentsJson: null,
    audioFileUri: null,
    audioFileUrl: null,
    audioFileExpiresAt: null,
    syncStatus: 'pending',
    lastSyncedAt: null,
    lastSyncAttemptAt: null,
    nextRetryAt: null,
    retryCount: 0,
    deletedAt: null,
    contentState: 'empty',
    cachedAt: createdAt,
  });
  /*Zustand 自动响应式，无需手动触发*/
  return (await loadLocalFragmentDraft(id)) as LocalFragmentDraft;
}

/*按 id 读取本地草稿镜像，并补齐待上传图片列表。 */
export async function loadLocalFragmentDraft(id: string): Promise<LocalFragmentDraft | null> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(eq(fragmentsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const mediaRows = await loadMediaRowsByFragmentIds([id]);
  return await mapLocalDraftRow(row, mediaRows.get(id) ?? []);
}

/*读取首页或文件夹页范围内的本地草稿（serverId 为 null 表示未同步），并按更新时间倒序。 */
export async function listLocalFragmentDrafts(
  folderId?: string | null
): Promise<LocalFragmentDraft[]> {
  const database = await getLocalDatabase();
  const conditions = [isNull(fragmentsTable.serverId), isNull(fragmentsTable.deletedAt)];
  if (folderId) {
    conditions.push(eq(fragmentsTable.folderId, folderId));
  }
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(and(...conditions))
    .orderBy(desc(fragmentsTable.updatedAt));
  const mediaRowsByFragmentId = await loadMediaRowsByFragmentIds(rows.map((row) => row.id));
  return await Promise.all(
    rows.map(async (row) => await mapLocalDraftRow(row, mediaRowsByFragmentId.get(row.id) ?? []))
  );
}

/*按补丁保存本地草稿，让正文与待上传图片都落到本地镜像中。 */
export async function saveLocalFragmentDraft(
  id: string,
  patch: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  const database = await getLocalDatabase();
  const current = await loadFragmentRowByIdOrServerId(id);
  if (!current) {
    return null;
  }

  if (typeof patch.body_html === 'string') {
    const normalizedHtml = await persistBodyHtml(id, patch.body_html);
    patch.plain_text_snapshot = extractPlainTextFromHtml(normalizedHtml);
  }

  await database
    .update(fragmentsTable)
    .set(buildLocalDraftRowPatch(current, patch))
    .where(eq(fragmentsTable.id, id));

  if (patch.pending_image_assets) {
    const existingRows = await database
      .select()
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.fragmentId, id));
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
          fragmentId: id,
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

  /*Zustand 自动响应式，无需手动触发*/
  return await loadLocalFragmentDraft(id);
}

/*删除本地草稿镜像，并同步回收关联待上传素材。 */
export async function deleteLocalFragmentDraft(id: string): Promise<void> {
  const database = await getLocalDatabase();
  await database.delete(mediaAssetsTable).where(eq(mediaAssetsTable.fragmentId, id));
  await database.delete(fragmentsTable).where(eq(fragmentsTable.id, id));
  await deleteFileIfExists(getFragmentBodyFile(id));
  /*删除缓存并清空列表缓存，Zustand 自动响应式*/
  useFragmentStore.getState().deleteDetail(id);
  useFragmentStore.getState().clearCache();
}

/*回填本地草稿绑定的 server_id，维持去重和跳详情的主键映射。 */
export async function bindServerId(
  id: string,
  serverId: string
): Promise<LocalFragmentDraft | null> {
  return await saveLocalFragmentDraft(id, {
    server_id: serverId,
    sync_status: 'pending',
  });
}

/*统一更新本地草稿同步状态，供 UI 与重试逻辑消费同一份真值。 */
export async function updateLocalFragmentSyncState(
  id: string,
  syncStatus: FragmentSyncStatus,
  patch?: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  return await saveLocalFragmentDraft(id, {
    ...patch,
    sync_status: syncStatus,
  });
}

/*把新选中的本地图片登记为待上传素材，并返回新的本地 asset 句柄。 */
export async function attachPendingLocalImage(
  fragmentId: string,
  payload: Pick<LocalPendingImageAsset, 'local_uri' | 'mime_type' | 'file_name'>
): Promise<LocalPendingImageAsset | null> {
  const draft = await loadLocalFragmentDraft(fragmentId);
  if (!draft) {
    return null;
  }
  const stagedFile = await stagePendingImage(payload.local_uri, payload.file_name, payload.mime_type);
  const pendingAsset: LocalPendingImageAsset = {
    local_asset_id: generateLocalImageId(),
    local_fragment_id: fragmentId,
    local_uri: stagedFile.uri,
    mime_type: payload.mime_type,
    file_name: payload.file_name,
    remote_asset_id: null,
    upload_status: 'pending',
  };
  await saveLocalFragmentDraft(fragmentId, {
    pending_image_assets: [...(draft.pending_image_assets ?? []), pendingAsset],
  });
  return pendingAsset;
}

/*回填待上传图片的上传状态与远端 asset id。 */
export async function markPendingImageUploaded(
  fragmentId: string,
  localAssetId: string,
  patch: Pick<LocalPendingImageAsset, 'remote_asset_id' | 'upload_status'>
): Promise<LocalFragmentDraft | null> {
  const draft = await loadLocalFragmentDraft(fragmentId);
  if (!draft) {
    return null;
  }
  return await saveLocalFragmentDraft(fragmentId, {
    pending_image_assets: (draft.pending_image_assets ?? []).map((asset) =>
      asset.local_asset_id === localAssetId ? { ...asset, ...patch } : asset
    ),
  });
}
