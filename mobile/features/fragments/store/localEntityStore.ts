import { and, eq, isNull } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import { getFragmentBodyFile } from '@/features/core/files/runtime';
import { extractPlainTextFromHtml } from '@/features/editor/html';
import type { Fragment, LocalPendingImageAsset } from '@/types/fragment';

import {
  generateFragmentId,
  generateLocalImageId,
  loadMediaRowsByFragmentIds,
  mapLocalEntityRowToFragment,
  persistBodyHtml,
  readFragmentRows,
  stagePendingImage,
} from './shared';
import { resolveFragmentEntityUpdate, type FragmentEntityPatch } from './updateState';
import { invalidateFragmentQueries } from '../queryCache';

export async function createLocalFragmentEntity(input: {
  folderId?: string | null;
  source: Fragment['source'];
  audioSource?: Fragment['audio_source'] | null;
  bodyHtml?: string;
  transcript?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  systemPurpose?: Fragment['system_purpose'];
  userPurpose?: Fragment['user_purpose'];
  systemTags?: string[] | null;
  userTags?: string[] | null;
  dismissedSystemTags?: string[] | null;
  contentState?: Fragment['content_state'];
  deviceId?: string | null;
}): Promise<Fragment> {
  const database = await getLocalDatabase();
  const id = generateFragmentId();
  const now = new Date().toISOString();
  const normalizedBody = await persistBodyHtml(id, input.bodyHtml ?? '');
  await database.insert(fragmentsTable).values({
    id,
    folderId: input.folderId ?? null,
    source: input.source,
    audioSource: input.audioSource ?? null,
    createdAt: now,
    updatedAt: now,
    summary: input.summary ?? null,
    tagsJson: JSON.stringify(input.tags ?? []),
    systemPurpose: input.systemPurpose ?? null,
    userPurpose: input.userPurpose ?? null,
    systemTagsJson: JSON.stringify(input.systemTags ?? input.tags ?? []),
    userTagsJson: JSON.stringify(input.userTags ?? []),
    dismissedSystemTagsJson: JSON.stringify(input.dismissedSystemTags ?? []),
    plainTextSnapshot: extractPlainTextFromHtml(normalizedBody),
    bodyFileUri: getFragmentBodyFile(id).uri,
    transcript: input.transcript ?? null,
    mediaTaskRunId: null,
    mediaTaskStatus: null,
    mediaTaskErrorMessage: null,
    speakerSegmentsJson: null,
    audioObjectKey: null,
    audioFileUri: null,
    audioFileUrl: null,
    audioFileExpiresAt: null,
    deletedAt: null,
    isFilmed: 0,
    filmedAt: null,
    backupStatus: 'pending',
    lastBackupAt: null,
    entityVersion: 1,
    lastModifiedDeviceId: input.deviceId ?? null,
    contentState: input.contentState ?? (normalizedBody ? 'body_present' : 'empty'),
    cachedAt: now,
  });
  const fragment = await readLocalFragmentEntity(id);
  if (!fragment) {
    throw new Error('创建本地 fragment 失败');
  }
  await invalidateFragmentQueries();
  return fragment;
}

export async function listLocalFragmentEntities(folderId?: string | null): Promise<Fragment[]> {
  /*碎片列表直接读取 SQLite 真值，不再额外维护第二层内存缓存。 */
  const rows = await readFragmentRows(folderId);
  const mediaRowsByFragmentId = await loadMediaRowsByFragmentIds(rows.map((row) => row.id));
  return await Promise.all(
    rows.map(async (row) => await mapLocalEntityRowToFragment(row, mediaRowsByFragmentId.get(row.id) ?? []))
  );
}

export async function readLocalFragmentEntity(fragmentId: string): Promise<Fragment | null> {
  /*单条碎片详情直接读取本地真值，避免 query 之外再堆一层缓存。 */
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(and(eq(fragmentsTable.id, fragmentId), isNull(fragmentsTable.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const mediaRowsByFragmentId = await loadMediaRowsByFragmentIds([fragmentId]);
  return await mapLocalEntityRowToFragment(row, mediaRowsByFragmentId.get(fragmentId) ?? []);
}

/*按 local-first 语义更新 fragment 真值，只在真实业务变更时推进排序时间和版本。 */
export async function updateLocalFragmentEntity(
  id: string,
  patch: FragmentEntityPatch
): Promise<Fragment | null> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(eq(fragmentsTable.id, id))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return null;
  }
  let plainTextSnapshot = patch.plain_text_snapshot;
  let bodyFileUri = current.bodyFileUri;
  if (typeof patch.body_html === 'string') {
    const normalizedHtml = await persistBodyHtml(id, patch.body_html);
    plainTextSnapshot = patch.plain_text_snapshot ?? extractPlainTextFromHtml(normalizedHtml);
    bodyFileUri = getFragmentBodyFile(id).uri;
  }
  const resolvedUpdate = resolveFragmentEntityUpdate({
    current,
    patch,
    plainTextSnapshot: plainTextSnapshot ?? current.plainTextSnapshot,
    bodyFileUri,
  });
  if (!resolvedUpdate.didChangeAnyField) {
    return await readLocalFragmentEntity(id);
  }
  await database
    .update(fragmentsTable)
    .set(resolvedUpdate.nextRow)
    .where(eq(fragmentsTable.id, id));
  const nextFragment = await readLocalFragmentEntity(id);
  await invalidateFragmentQueries();
  return nextFragment;
}

export async function stageLocalFragmentPendingImage(
  fragmentId: string,
  payload: Pick<LocalPendingImageAsset, 'local_uri' | 'mime_type' | 'file_name'>
): Promise<LocalPendingImageAsset | null> {
  /*把编辑器新选中的图片直接登记到本地实体附件表，避免再走旧草稿容器。 */
  const current = await readLocalFragmentEntity(fragmentId);
  if (!current) {
    return null;
  }

  const stagedFile = await stagePendingImage(payload.local_uri, payload.file_name, payload.mime_type);
  const pendingAsset: LocalPendingImageAsset = {
    local_asset_id: generateLocalImageId(),
    local_fragment_id: fragmentId,
    local_uri: stagedFile.uri,
    mime_type: payload.mime_type,
    file_name: payload.file_name,
    backup_object_key: null,
    upload_status: 'pending',
  };

  const database = await getLocalDatabase();
  await database.insert(mediaAssetsTable).values({
    id: pendingAsset.local_asset_id,
    fragmentId,
    backupObjectKey: null,
    mediaKind: 'image',
    mimeType: pendingAsset.mime_type,
    fileName: pendingAsset.file_name,
    localFileUri: pendingAsset.local_uri,
    remoteFileUrl: null,
    remoteExpiresAt: null,
    uploadStatus: pendingAsset.upload_status,
    fileSize: 0,
    checksum: null,
    width: null,
    height: null,
    durationMs: null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    backupStatus: 'pending',
    lastBackupAt: null,
    entityVersion: 1,
    lastModifiedDeviceId: null,
  });

  await invalidateFragmentQueries();
  return pendingAsset;
}

export async function deleteLocalFragmentEntity(
  id: string,
  options?: { deviceId?: string | null }
): Promise<void> {
  /*删除本地 fragment 后统一失效查询，让列表与详情回到当前 SQLite 真值。 */
  await updateLocalFragmentEntity(id, {
    deleted_at: new Date().toISOString(),
    backup_status: 'pending',
    last_modified_device_id: options?.deviceId ?? null,
  });
}

export async function markLocalFragmentFilmed(
  id: string,
  options?: { filmedAt?: string; deviceId?: string | null }
): Promise<Fragment | null> {
  /*将碎片标记为已拍，统一走 local-first 内容资产状态。 */
  const filmedAt = options?.filmedAt ?? new Date().toISOString();
  return await updateLocalFragmentEntity(id, {
    is_filmed: true,
    filmed_at: filmedAt,
    backup_status: 'pending',
    last_modified_device_id: options?.deviceId ?? null,
  });
}
