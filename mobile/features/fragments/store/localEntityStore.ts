import { and, eq, isNull } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import { getFragmentBodyFile } from '@/features/core/files/runtime';
import { extractPlainTextFromHtml } from '@/features/editor/html';
import type { Fragment, LocalPendingImageAsset } from '@/types/fragment';

import {
  buildLocalDraftRowPatch,
  generateFragmentId,
  generateLocalImageId,
  loadMediaRowsByFragmentIds,
  mapLocalEntityRowToFragment,
  persistBodyHtml,
  readFragmentRows,
  serializeSpeakerSegments,
  serializeTags,
  stagePendingImage,
} from './shared';
import { useFragmentStore } from './fragmentStore';

export async function createLocalFragmentEntity(input: {
  folderId?: string | null;
  source: Fragment['source'];
  audioSource?: Fragment['audio_source'] | null;
  bodyHtml?: string;
  transcript?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  contentState?: Fragment['content_state'];
  deviceId?: string | null;
}): Promise<Fragment> {
  const database = await getLocalDatabase();
  const id = generateFragmentId();
  const now = new Date().toISOString();
  const normalizedBody = await persistBodyHtml(id, input.bodyHtml ?? '');
  await database.insert(fragmentsTable).values({
    id,
    legacyServerBindingId: null,
    folderId: input.folderId ?? null,
    source: input.source,
    audioSource: input.audioSource ?? null,
    createdAt: now,
    updatedAt: now,
    summary: input.summary ?? null,
    tagsJson: JSON.stringify(input.tags ?? []),
    plainTextSnapshot: normalizedBody.replace(/<[^>]+>/g, ' ').trim(),
    bodyFileUri: getFragmentBodyFile(id).uri,
    transcript: input.transcript ?? null,
    speakerSegmentsJson: null,
    audioObjectKey: null,
    audioFileUri: null,
    audioFileUrl: null,
    audioFileExpiresAt: null,
    legacyCloudBindingStatus: 'pending',
    lastSyncedAt: null,
    lastSyncAttemptAt: null,
    nextRetryAt: null,
    retryCount: 0,
    deletedAt: null,
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
  return fragment;
}

export async function listLocalFragmentEntities(folderId?: string | null): Promise<Fragment[]> {
  const rows = await readFragmentRows(folderId);
  const mediaRowsByFragmentId = await loadMediaRowsByFragmentIds(rows.map((row) => row.id));
  const fragments = await Promise.all(
    rows.map(async (row) => await mapLocalEntityRowToFragment(row, mediaRowsByFragmentId.get(row.id) ?? []))
  );
  useFragmentStore.getState().setList(folderId ?? null, fragments);
  useFragmentStore.getState().batchUpdateDetails(fragments);
  return fragments;
}

export async function readLocalFragmentEntity(fragmentId: string): Promise<Fragment | null> {
  const cached = useFragmentStore.getState().getDetail(fragmentId);
  if (cached) {
    return cached;
  }
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
  const fragment = await mapLocalEntityRowToFragment(row, mediaRowsByFragmentId.get(fragmentId) ?? []);
  useFragmentStore.getState().setDetail(fragmentId, fragment);
  return fragment;
}

export async function updateLocalFragmentEntity(
  id: string,
  patch: Partial<Fragment> & {
    backup_status?: Fragment['backup_status'];
    entity_version?: number;
    last_backup_at?: string | null;
    deleted_at?: string | null;
    last_modified_device_id?: string | null;
    last_sync_attempt_at?: string | null;
    next_retry_at?: string | null;
    retry_count?: number;
  }
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
  await database
    .update(fragmentsTable)
    .set({
      ...buildLocalDraftRowPatch(current, {
        body_html: patch.body_html,
        plain_text_snapshot: plainTextSnapshot ?? undefined,
        sync_status: patch.sync_status,
        last_sync_attempt_at: patch.last_sync_attempt_at,
        next_retry_at: patch.next_retry_at,
        retry_count: patch.retry_count,
      }),
      legacyServerBindingId:
        patch.server_id === undefined ? current.legacyServerBindingId : patch.server_id,
      folderId: patch.folder_id === undefined ? current.folderId : patch.folder_id,
      source: patch.source === undefined ? current.source : patch.source,
      audioSource: patch.audio_source === undefined ? current.audioSource : patch.audio_source,
      createdAt: patch.created_at === undefined ? current.createdAt : patch.created_at,
      summary: patch.summary === undefined ? current.summary : patch.summary,
      tagsJson: patch.tags === undefined ? current.tagsJson : serializeTags(patch.tags),
      transcript: patch.transcript === undefined ? current.transcript : patch.transcript,
      speakerSegmentsJson:
        patch.speaker_segments === undefined
          ? current.speakerSegmentsJson
          : serializeSpeakerSegments(patch.speaker_segments),
      audioObjectKey:
        patch.audio_object_key === undefined ? current.audioObjectKey : patch.audio_object_key,
      audioFileUrl:
        patch.audio_file_url === undefined ? current.audioFileUrl : patch.audio_file_url,
      audioFileExpiresAt:
        patch.audio_file_expires_at === undefined
          ? current.audioFileExpiresAt
          : patch.audio_file_expires_at,
      bodyFileUri,
      contentState: patch.content_state === undefined ? current.contentState : patch.content_state,
      backupStatus: patch.backup_status ?? 'pending',
      entityVersion: patch.entity_version ?? (current.entityVersion + 1),
      lastBackupAt: patch.last_backup_at ?? current.lastBackupAt ?? undefined,
      lastModifiedDeviceId:
        patch.last_modified_device_id ?? current.lastModifiedDeviceId ?? undefined,
      deletedAt: patch.deleted_at ?? current.deletedAt ?? undefined,
    })
    .where(eq(fragmentsTable.id, id));
  useFragmentStore.getState().deleteDetail(id);
  return await readLocalFragmentEntity(id);
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
    remote_asset_id: null,
    upload_status: 'pending',
  };

  const database = await getLocalDatabase();
  await database.insert(mediaAssetsTable).values({
    id: pendingAsset.local_asset_id,
    fragmentId,
    remoteAssetId: null,
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
    status: pendingAsset.upload_status,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    backupStatus: 'pending',
    lastBackupAt: null,
    entityVersion: 1,
    lastModifiedDeviceId: null,
  });

  useFragmentStore.getState().deleteDetail(fragmentId);
  return pendingAsset;
}

export async function deleteLocalFragmentEntity(
  id: string,
  options?: { deviceId?: string | null }
): Promise<void> {
  await updateLocalFragmentEntity(id, {
    deleted_at: new Date().toISOString(),
    backup_status: 'pending',
    last_modified_device_id: options?.deviceId ?? null,
  });
  useFragmentStore.getState().deleteDetail(id);
  useFragmentStore.getState().clearCache();
}
