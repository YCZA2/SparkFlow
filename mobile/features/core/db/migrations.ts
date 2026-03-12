import type { SQLiteDatabase } from 'expo-sqlite';

const LATEST_SCHEMA_VERSION = 1;

/*创建本地镜像所需的 SQLite 表与索引。 */
export async function runLocalDatabaseMigrations(database: SQLiteDatabase): Promise<void> {
  const versionResult = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = Number(versionResult?.user_version ?? 0);
  if (currentVersion >= LATEST_SCHEMA_VERSION) {
    return;
  }

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS fragments (
      id TEXT PRIMARY KEY NOT NULL,
      remote_id TEXT,
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
      audio_file_uri TEXT,
      audio_file_url TEXT,
      audio_file_expires_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      remote_sync_state TEXT NOT NULL DEFAULT 'idle',
      last_synced_at TEXT,
      last_remote_version TEXT,
      last_sync_attempt_at TEXT,
      next_retry_at TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      is_local_draft INTEGER NOT NULL DEFAULT 0,
      local_sync_status TEXT,
      display_source_label TEXT,
      content_state TEXT,
      cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS fragments_remote_id_idx ON fragments(remote_id);
    CREATE INDEX IF NOT EXISTS fragments_folder_id_idx ON fragments(folder_id);
    CREATE INDEX IF NOT EXISTS fragments_created_at_idx ON fragments(created_at DESC);
    CREATE INDEX IF NOT EXISTS fragments_is_local_draft_idx ON fragments(is_local_draft);

    CREATE TABLE IF NOT EXISTS fragment_folders (
      id TEXT PRIMARY KEY NOT NULL,
      remote_id TEXT,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'synced'
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
      status TEXT NOT NULL DEFAULT 'uploaded',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS media_assets_fragment_id_idx ON media_assets(fragment_id);
    CREATE INDEX IF NOT EXISTS media_assets_remote_asset_id_idx ON media_assets(remote_asset_id);

    CREATE TABLE IF NOT EXISTS pending_ops (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      op_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS pending_ops_entity_idx ON pending_ops(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS pending_ops_status_idx ON pending_ops(status, next_retry_at);
  `);

  await database.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
}
