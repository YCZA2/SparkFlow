import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/*定义本地镜像里的 fragments 主表，承接列表索引与 local-first 备份元数据。 */
export const fragmentsTable = sqliteTable('fragments', {
  id: text('id').primaryKey(),
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
  mediaTaskRunId: text('media_task_run_id'),
  mediaTaskStatus: text('media_task_status'),
  mediaTaskErrorMessage: text('media_task_error_message'),
  deletedAt: text('deleted_at'),
  isFilmed: integer('is_filmed').notNull().default(0),
  filmedAt: text('filmed_at'),
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
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
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
  backupObjectKey: text('backup_object_key'),
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
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
  backupStatus: text('backup_status').notNull().default('pending'),
  lastBackupAt: text('last_backup_at'),
  entityVersion: integer('entity_version').notNull().default(1),
  lastModifiedDeviceId: text('last_modified_device_id'),
});

/*定义本地 scripts 主表，承接成稿正文真值、来源关系与 local-first 备份元数据。 */
export const scriptsTable = sqliteTable('scripts', {
  id: text('id').primaryKey(),
  title: text('title'),
  mode: text('mode').notNull(),
  generationKind: text('generation_kind').notNull().default('manual'),
  sourceFragmentIdsJson: text('source_fragment_ids_json').notNull().default('[]'),
  isDailyPush: integer('is_daily_push').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  generatedAt: text('generated_at').notNull(),
  plainTextSnapshot: text('plain_text_snapshot').notNull().default(''),
  bodyFileUri: text('body_file_uri'),
  isFilmed: integer('is_filmed').notNull().default(0),
  filmedAt: text('filmed_at'),
  copyOfScriptId: text('copy_of_script_id'),
  copyReason: text('copy_reason'),
  trashedAt: text('trashed_at'),
  deletedAt: text('deleted_at'),
  backupStatus: text('backup_status').notNull().default('pending'),
  lastBackupAt: text('last_backup_at'),
  entityVersion: integer('entity_version').notNull().default(1),
  lastModifiedDeviceId: text('last_modified_device_id'),
  cachedAt: text('cached_at').notNull(),
});

export const localSchema = {
  fragmentsTable,
  fragmentFoldersTable,
  mediaAssetsTable,
  scriptsTable,
};
