import type { SQLiteDatabase } from 'expo-sqlite';

const LATEST_SCHEMA_VERSION = 9;

const REQUIRED_TABLE_COLUMNS: Record<string, string[]> = {
  fragments: [
    'id',
    'folder_id',
    'source',
    'audio_source',
    'created_at',
    'updated_at',
    'summary',
    'tags_json',
    'plain_text_snapshot',
    'body_file_uri',
    'transcript',
    'speaker_segments_json',
    'audio_object_key',
    'audio_file_uri',
    'audio_file_url',
    'audio_file_expires_at',
    'media_pipeline_run_id',
    'media_pipeline_status',
    'media_pipeline_error_message',
    'deleted_at',
    'is_filmed',
    'filmed_at',
    'backup_status',
    'last_backup_at',
    'entity_version',
    'last_modified_device_id',
    'content_state',
    'cached_at',
  ],
  fragment_folders: [
    'id',
    'name',
    'created_at',
    'updated_at',
    'deleted_at',
    'backup_status',
    'last_backup_at',
    'entity_version',
    'last_modified_device_id',
  ],
  media_assets: [
    'id',
    'fragment_id',
    'remote_asset_id',
    'media_kind',
    'mime_type',
    'file_name',
    'local_file_uri',
    'remote_file_url',
    'remote_expires_at',
    'upload_status',
    'file_size',
    'checksum',
    'width',
    'height',
    'duration_ms',
    'created_at',
    'deleted_at',
    'backup_status',
    'last_backup_at',
    'entity_version',
    'last_modified_device_id',
  ],
  scripts: [
    'id',
    'title',
    'mode',
    'generation_kind',
    'source_fragment_ids_json',
    'is_daily_push',
    'created_at',
    'updated_at',
    'generated_at',
    'plain_text_snapshot',
    'body_file_uri',
    'is_filmed',
    'filmed_at',
    'copy_of_script_id',
    'copy_reason',
    'trashed_at',
    'deleted_at',
    'backup_status',
    'last_backup_at',
    'entity_version',
    'last_modified_device_id',
    'cached_at',
  ],
};

/*创建当前版本所需的 SQLite 表和索引。*/
async function createLatestSchema(database: SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS fragments (
      id TEXT PRIMARY KEY NOT NULL,
      folder_id TEXT,
      source TEXT NOT NULL,
      audio_source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      summary TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      plain_text_snapshot TEXT NOT NULL DEFAULT '',
      body_file_uri TEXT,
      transcript TEXT,
      speaker_segments_json TEXT,
      audio_object_key TEXT,
      audio_file_uri TEXT,
      audio_file_url TEXT,
      audio_file_expires_at TEXT,
      media_pipeline_run_id TEXT,
      media_pipeline_status TEXT,
      media_pipeline_error_message TEXT,
      deleted_at TEXT,
      is_filmed INTEGER NOT NULL DEFAULT 0,
      filmed_at TEXT,
      backup_status TEXT NOT NULL DEFAULT 'pending',
      last_backup_at TEXT,
      entity_version INTEGER NOT NULL DEFAULT 1,
      last_modified_device_id TEXT,
      content_state TEXT,
      cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS fragments_folder_id_idx ON fragments(folder_id);
    CREATE INDEX IF NOT EXISTS fragments_updated_at_idx ON fragments(updated_at DESC);

    CREATE TABLE IF NOT EXISTS fragment_folders (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      backup_status TEXT NOT NULL DEFAULT 'pending',
      last_backup_at TEXT,
      entity_version INTEGER NOT NULL DEFAULT 1,
      last_modified_device_id TEXT
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY NOT NULL,
      fragment_id TEXT NOT NULL,
      remote_asset_id TEXT,
      media_kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      local_file_uri TEXT,
      remote_file_url TEXT,
      remote_expires_at TEXT,
      upload_status TEXT NOT NULL DEFAULT 'uploaded',
      file_size INTEGER NOT NULL DEFAULT 0,
      checksum TEXT,
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      backup_status TEXT NOT NULL DEFAULT 'pending',
      last_backup_at TEXT,
      entity_version INTEGER NOT NULL DEFAULT 1,
      last_modified_device_id TEXT
    );

    CREATE INDEX IF NOT EXISTS media_assets_fragment_id_idx ON media_assets(fragment_id);
    CREATE INDEX IF NOT EXISTS media_assets_remote_asset_id_idx ON media_assets(remote_asset_id);

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT,
      mode TEXT NOT NULL,
      generation_kind TEXT NOT NULL DEFAULT 'manual',
      source_fragment_ids_json TEXT NOT NULL DEFAULT '[]',
      is_daily_push INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      plain_text_snapshot TEXT NOT NULL DEFAULT '',
      body_file_uri TEXT,
      is_filmed INTEGER NOT NULL DEFAULT 0,
      filmed_at TEXT,
      copy_of_script_id TEXT,
      copy_reason TEXT,
      trashed_at TEXT,
      deleted_at TEXT,
      backup_status TEXT NOT NULL DEFAULT 'pending',
      last_backup_at TEXT,
      entity_version INTEGER NOT NULL DEFAULT 1,
      last_modified_device_id TEXT,
      cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS scripts_generated_at_idx ON scripts(generated_at DESC);
    CREATE INDEX IF NOT EXISTS scripts_trashed_at_idx ON scripts(trashed_at);
    CREATE INDEX IF NOT EXISTS scripts_deleted_at_idx ON scripts(deleted_at);
    CREATE INDEX IF NOT EXISTS scripts_copy_of_script_id_idx ON scripts(copy_of_script_id);
  `);
}

/*读取指定表的当前列集合，用来判断本地 schema 是否仍符合最新结构。*/
async function getTableColumns(database: SQLiteDatabase, tableName: string): Promise<Set<string>> {
  const rows = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName});`);
  return new Set(rows.map((row) => row.name));
}

/*校验本地表结构是否仍满足当前版本所需列集合。*/
async function isLatestSchemaShape(database: SQLiteDatabase): Promise<boolean> {
  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_TABLE_COLUMNS)) {
    const columns = await getTableColumns(database, tableName);
    if (columns.size === 0) {
      return false;
    }
    if (requiredColumns.some((column) => !columns.has(column))) {
      return false;
    }
  }
  return true;
}

/*创建本地镜像所需的 SQLite 表与索引。*/
export async function runLocalDatabaseMigrations(database: SQLiteDatabase): Promise<void> {
  const versionResult = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = Number(versionResult?.user_version ?? 0);

  if (currentVersion === LATEST_SCHEMA_VERSION && (await isLatestSchemaShape(database))) {
    await createLatestSchema(database);
    return;
  }

  if (currentVersion === 0) {
    await createLatestSchema(database);
    await database.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
    return;
  }

  throw new Error(`检测到旧本地数据库 schema 版本 ${currentVersion}，当前正式包不允许自动清库重建`);
}
