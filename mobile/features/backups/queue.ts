import { and, eq, isNull, or } from 'drizzle-orm';

import { getOrCreateDeviceId } from '@/features/auth/device';
import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentFoldersTable, fragmentsTable, mediaAssetsTable, scriptsTable } from '@/features/core/db/schema';
import { readFragmentBodyFile, readScriptBodyFile } from '@/features/core/files/runtime';
import { deserializeSpeakerSegments, deserializeTags } from '@/features/fragments/store/shared';
import { deserializeSourceFragmentIds } from '@/features/scripts/store/shared';

import {
  pushBackupBatch,
  uploadBackupAsset,
  type BackupFragmentContractPayload,
  type BackupFolderContractPayload,
  type BackupMediaAssetContractPayload,
  type BackupScriptContractPayload,
  type BackupMutationItem,
} from './api';

let flushPromise: Promise<void> | null = null;

async function buildFragmentItems(deviceId: string): Promise<BackupMutationItem[]> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(or(eq(fragmentsTable.backupStatus, 'pending'), eq(fragmentsTable.backupStatus, 'failed')));
  return await Promise.all(
    rows.map(async (row) => {
      const payload: BackupFragmentContractPayload | null = row.deletedAt
        ? null
        : {
            id: row.id,
            server_id: row.legacyServerBindingId,
            folder_id: row.folderId,
            source: row.source,
            audio_source: row.audioSource,
            created_at: row.createdAt,
            updated_at: row.updatedAt,
            summary: row.summary,
            tags: deserializeTags(row.tagsJson),
            transcript: row.transcript,
            speaker_segments: deserializeSpeakerSegments(row.speakerSegmentsJson),
            audio_object_key: row.audioObjectKey,
            audio_file_url: row.audioFileUrl,
            audio_file_expires_at: row.audioFileExpiresAt,
            body_html: (await readFragmentBodyFile(row.id)) ?? '',
            plain_text_snapshot: row.plainTextSnapshot,
            content_state: row.contentState,
            is_filmed: row.isFilmed === 1,
            filmed_at: row.filmedAt ?? null,
            deleted_at: row.deletedAt,
          };
      return {
      entity_type: 'fragment' as const,
      entity_id: row.id,
      entity_version: row.entityVersion,
      operation: row.deletedAt ? 'delete' : 'upsert',
      payload,
      modified_at: row.updatedAt,
      last_modified_device_id: row.lastModifiedDeviceId ?? deviceId,
    };
    })
  );
}

async function buildFolderItems(deviceId: string): Promise<BackupMutationItem[]> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentFoldersTable)
    .where(or(eq(fragmentFoldersTable.backupStatus, 'pending'), eq(fragmentFoldersTable.backupStatus, 'failed')));
  return rows.map((row) => {
    const payload: BackupFolderContractPayload | null = row.deletedAt
      ? null
      : {
          id: row.id,
          remote_id: row.legacyRemoteId,
          name: row.name,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          deleted_at: row.deletedAt,
        };
    return {
    entity_type: 'folder' as const,
    entity_id: row.id,
    entity_version: row.entityVersion,
    operation: row.deletedAt ? 'delete' : 'upsert',
    payload,
    modified_at: row.updatedAt,
    last_modified_device_id: row.lastModifiedDeviceId ?? deviceId,
  };
  });
}

async function buildMediaAssetItems(deviceId: string): Promise<BackupMutationItem[]> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(mediaAssetsTable)
    .where(or(eq(mediaAssetsTable.backupStatus, 'pending'), eq(mediaAssetsTable.backupStatus, 'failed')));
  const nextItems: BackupMutationItem[] = [];
  for (const row of rows) {
    let backupFileUrl = row.remoteFileUrl;
    let backupObjectKey = row.remoteAssetId;
    if (!row.deletedAt && row.localFileUri) {
      const uploaded = await uploadBackupAsset({
        uri: row.localFileUri,
        fileName: row.fileName,
        mimeType: row.mimeType,
        entityType: 'media_asset',
        entityId: row.id,
      });
      backupFileUrl = uploaded.file_url;
      backupObjectKey = uploaded.object_key;
      await database
        .update(mediaAssetsTable)
        .set({
          remoteFileUrl: uploaded.file_url,
          remoteAssetId: uploaded.object_key,
        })
        .where(eq(mediaAssetsTable.id, row.id));
    }
    const payload: BackupMediaAssetContractPayload | null = row.deletedAt
      ? null
      : {
          id: row.id,
          fragment_id: row.fragmentId,
          media_kind: row.mediaKind as BackupMediaAssetContractPayload['media_kind'],
          mime_type: row.mimeType,
          file_name: row.fileName,
          backup_object_key: backupObjectKey,
          backup_file_url: backupFileUrl,
          remote_expires_at: row.remoteExpiresAt,
          upload_status: row.uploadStatus,
          file_size: row.fileSize,
          checksum: row.checksum,
          width: row.width,
          height: row.height,
          duration_ms: row.durationMs,
          created_at: row.createdAt,
          deleted_at: row.deletedAt,
        };
    nextItems.push({
      entity_type: 'media_asset',
      entity_id: row.id,
      entity_version: row.entityVersion,
      operation: row.deletedAt ? 'delete' : 'upsert',
      payload,
      modified_at: row.createdAt,
      last_modified_device_id: row.lastModifiedDeviceId ?? deviceId,
    });
  }
  return nextItems;
}

async function buildScriptItems(deviceId: string): Promise<BackupMutationItem[]> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(scriptsTable)
    .where(or(eq(scriptsTable.backupStatus, 'pending'), eq(scriptsTable.backupStatus, 'failed')));
  return await Promise.all(
    rows.map(async (row) => {
      const payload: BackupScriptContractPayload | null = row.deletedAt
        ? null
        : {
            id: row.id,
            title: row.title ?? null,
            mode: row.mode as BackupScriptContractPayload['mode'],
            generation_kind: row.generationKind as BackupScriptContractPayload['generation_kind'],
            source_fragment_ids: deserializeSourceFragmentIds(row.sourceFragmentIdsJson),
            is_daily_push: row.isDailyPush === 1,
            created_at: row.createdAt,
            updated_at: row.updatedAt,
            generated_at: row.generatedAt,
            body_html: (await readScriptBodyFile(row.id)) ?? '',
            plain_text_snapshot: row.plainTextSnapshot,
            is_filmed: row.isFilmed === 1,
            filmed_at: row.filmedAt ?? null,
            copy_of_script_id: row.copyOfScriptId ?? null,
            copy_reason: (row.copyReason as BackupScriptContractPayload['copy_reason']) ?? null,
            trashed_at: row.trashedAt ?? null,
            deleted_at: row.deletedAt ?? null,
          };
      return {
        entity_type: 'script' as const,
        entity_id: row.id,
        entity_version: row.entityVersion,
        operation: row.deletedAt ? 'delete' : 'upsert',
        payload,
        modified_at: row.updatedAt,
        last_modified_device_id: row.lastModifiedDeviceId ?? deviceId,
      };
    })
  );
}

async function markBackupsSynced(items: BackupMutationItem[], serverGeneratedAt: string): Promise<void> {
  // 按 id + entityVersion 精确匹配，避免把扫描结束后新产生的 pending 修改误标为 synced。
  // 若用户在备份飞行期间编辑了某实体，entityVersion 已递增，本次不会命中，下次 flush 再处理。
  const database = await getLocalDatabase();
  for (const item of items) {
    switch (item.entity_type) {
      case 'fragment':
        await database
          .update(fragmentsTable)
          .set({ backupStatus: 'synced', lastBackupAt: serverGeneratedAt })
          .where(and(eq(fragmentsTable.id, item.entity_id), eq(fragmentsTable.entityVersion, item.entity_version)));
        break;
      case 'folder':
        await database
          .update(fragmentFoldersTable)
          .set({ backupStatus: 'synced', lastBackupAt: serverGeneratedAt })
          .where(and(eq(fragmentFoldersTable.id, item.entity_id), eq(fragmentFoldersTable.entityVersion, item.entity_version)));
        break;
      case 'media_asset':
        await database
          .update(mediaAssetsTable)
          .set({ backupStatus: 'synced', lastBackupAt: serverGeneratedAt })
          .where(and(eq(mediaAssetsTable.id, item.entity_id), eq(mediaAssetsTable.entityVersion, item.entity_version)));
        break;
      case 'script':
        await database
          .update(scriptsTable)
          .set({ backupStatus: 'synced', lastBackupAt: serverGeneratedAt })
          .where(and(eq(scriptsTable.id, item.entity_id), eq(scriptsTable.entityVersion, item.entity_version)));
        break;
    }
  }
}

async function markBackupsFailed(): Promise<void> {
  const database = await getLocalDatabase();
  await database
    .update(fragmentsTable)
    .set({ backupStatus: 'failed' })
    .where(eq(fragmentsTable.backupStatus, 'pending'));
  await database
    .update(fragmentFoldersTable)
    .set({ backupStatus: 'failed' })
    .where(eq(fragmentFoldersTable.backupStatus, 'pending'));
  await database
    .update(mediaAssetsTable)
    .set({ backupStatus: 'failed' })
    .where(eq(mediaAssetsTable.backupStatus, 'pending'));
  await database
    .update(scriptsTable)
    .set({ backupStatus: 'failed' })
    .where(eq(scriptsTable.backupStatus, 'pending'));
}

export async function flushBackupQueue(): Promise<void> {
  if (!flushPromise) {
    flushPromise = (async () => {
      const deviceId = await getOrCreateDeviceId();
      const items = [
        ...(await buildFolderItems(deviceId)),
        ...(await buildMediaAssetItems(deviceId)),
        ...(await buildFragmentItems(deviceId)),
        ...(await buildScriptItems(deviceId)),
      ];
      if (items.length === 0) {
        return;
      }
      try {
        const response = await pushBackupBatch(items);
        await markBackupsSynced(items, response.server_generated_at);
      } catch (error) {
        await markBackupsFailed();
        throw error;
      }
    })().finally(() => {
      flushPromise = null;
    });
  }
  await flushPromise;
}
