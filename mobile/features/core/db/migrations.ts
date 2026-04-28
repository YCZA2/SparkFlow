import type { SQLiteDatabase } from 'expo-sqlite';

const LATEST_SCHEMA_VERSION = 12;

/*创建当前开发阶段的本地 SQLite 基线；旧开发库直接重建，不保留历史升级链。 */
export async function runLocalDatabaseMigrations(database: SQLiteDatabase): Promise<void> {
  const versionResult = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = Number(versionResult?.user_version ?? 0);
  if (currentVersion >= LATEST_SCHEMA_VERSION) {
    return;
  }

  await database.execAsync(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS fragments;
    DROP TABLE IF EXISTS fragment_folders;
    DROP TABLE IF EXISTS media_assets;
    DROP TABLE IF EXISTS scripts;

    CREATE TABLE fragments (
      id TEXT PRIMARY KEY NOT NULL,
      folder_id TEXT,
      source TEXT NOT NULL,
      audio_source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      summary TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      system_purpose TEXT,
      user_purpose TEXT,
      system_tags_json TEXT NOT NULL DEFAULT '[]',
      user_tags_json TEXT NOT NULL DEFAULT '[]',
      dismissed_system_tags_json TEXT NOT NULL DEFAULT '[]',
      plain_text_snapshot TEXT NOT NULL DEFAULT '',
      body_file_uri TEXT,
      transcript TEXT,
      speaker_segments_json TEXT,
      audio_object_key TEXT,
      audio_file_uri TEXT,
      audio_file_url TEXT,
      audio_file_expires_at TEXT,
      media_task_run_id TEXT,
      media_task_status TEXT,
      media_task_error_message TEXT,
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

    CREATE TABLE fragment_folders (
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

    CREATE TABLE media_assets (
      id TEXT PRIMARY KEY NOT NULL,
      fragment_id TEXT NOT NULL,
      backup_object_key TEXT,
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
    CREATE INDEX IF NOT EXISTS media_assets_backup_object_key_idx ON media_assets(backup_object_key);

    CREATE TABLE scripts (
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

    PRAGMA foreign_keys = ON;
    PRAGMA user_version = ${LATEST_SCHEMA_VERSION};
  `);
}
