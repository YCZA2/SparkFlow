import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/*定义本地镜像里的 fragments 主表，承接列表索引与 legacy 云端绑定元数据。 */
export const fragmentsTable = sqliteTable('fragments', {
  id: text('id').primaryKey(),
  legacyServerBindingId: text('server_id'),
  folderId: text('folder_id'),
  source: text('source').notNull(),
  audioSource: text('audio_source'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  summary: text('summary'),
  tagsJson: text('tags_json').notNull().default('[]'),
  plainTextSnapshot: text('plain_text_snapshot').notNull().default(''),
  bodyFileUri: text('body_file_uri'),
  transcript: text('transcript'),
  speakerSegmentsJson: text('speaker_segments_json'),
  audioObjectKey: text('audio_object_key'),
  audioFileUri: text('audio_file_uri'),
  audioFileUrl: text('audio_file_url'),
  audioFileExpiresAt: text('audio_file_expires_at'),
  legacyCloudBindingStatus: text('sync_status').notNull().default('synced'),
  lastSyncedAt: text('last_synced_at'),
  lastSyncAttemptAt: text('last_sync_attempt_at'),
  nextRetryAt: text('next_retry_at'),
  retryCount: integer('retry_count').notNull().default(0),
  deletedAt: text('deleted_at'),
  backupStatus: text('backup_status').notNull().default('pending'),
  lastBackupAt: text('last_backup_at'),
  entityVersion: integer('entity_version').notNull().default(1),
  lastModifiedDeviceId: text('last_modified_device_id'),
  contentState: text('content_state'),
  cachedAt: text('cached_at').notNull(),
});

/*定义文件夹索引表，为后续本地镜像筛选与目录展示预留结构。 */
export const fragmentFoldersTable = sqliteTable('fragment_folders', {
  id: text('id').primaryKey(),
  legacyRemoteId: text('remote_id'),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  legacyCloudBindingStatus: text('sync_status').notNull().default('synced'),
  deletedAt: text('deleted_at'),
  backupStatus: text('backup_status').notNull().default('pending'),
  lastBackupAt: text('last_backup_at'),
  entityVersion: integer('entity_version').notNull().default(1),
  lastModifiedDeviceId: text('last_modified_device_id'),
});

/*定义媒体资源表，统一承接远端素材与本地待上传文件。 */
export const mediaAssetsTable = sqliteTable('media_assets', {
  id: text('id').primaryKey(),
  fragmentId: text('fragment_id').notNull(),
  remoteAssetId: text('remote_asset_id'),
  mediaKind: text('media_kind').notNull(),
  mimeType: text('mime_type').notNull(),
  fileName: text('file_name').notNull(),
  localFileUri: text('local_file_uri'),
  remoteFileUrl: text('remote_file_url'),
  remoteExpiresAt: text('remote_expires_at'),
  uploadStatus: text('upload_status').notNull().default('uploaded'),
  fileSize: integer('file_size').notNull().default(0),
  checksum: text('checksum'),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  status: text('status').notNull().default('uploaded'),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
  backupStatus: text('backup_status').notNull().default('pending'),
  lastBackupAt: text('last_backup_at'),
  entityVersion: integer('entity_version').notNull().default(1),
  lastModifiedDeviceId: text('last_modified_device_id'),
});

export const localSchema = {
  fragmentsTable,
  fragmentFoldersTable,
  mediaAssetsTable,
};
