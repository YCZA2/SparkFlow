import type { SQLiteDatabase } from 'expo-sqlite';

const LATEST_SCHEMA_VERSION = 4;

/*创建本地镜像所需的 SQLite 表与索引。 */
export async function runLocalDatabaseMigrations(database: SQLiteDatabase): Promise<void> {
  const versionResult = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = Number(versionResult?.user_version ?? 0);
  if (currentVersion >= LATEST_SCHEMA_VERSION) {
    return;
  }

  // Version 1: 初始 schema
  if (currentVersion < 1) {
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
    `);
  }

  // Version 2: 保留物理列兼容的同时，收敛为统一的 legacy 云端绑定字段
  if (currentVersion < 2) {
    await database.execAsync(`
      -- 物理列沿用 server_id，作为 legacy 云端绑定字段继续保留
      ALTER TABLE fragments RENAME COLUMN remote_id TO server_id;

      -- 移除废弃的列（SQLite 不支持 DROP COLUMN，我们创建新表）
      CREATE TABLE fragments_new (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
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
        last_synced_at TEXT,
        last_sync_attempt_at TEXT,
        next_retry_at TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        content_state TEXT,
        cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 复制数据
      INSERT INTO fragments_new
        SELECT
          id, server_id, folder_id, source, audio_source, created_at, updated_at,
          summary, tags_json, plain_text_snapshot, body_file_uri, transcript,
          speaker_segments_json, audio_file_uri, audio_file_url, audio_file_expires_at,
          sync_status, last_synced_at, last_sync_attempt_at, next_retry_at,
          retry_count, deleted_at, content_state, cached_at
        FROM fragments;

      -- 替换旧表
      DROP TABLE fragments;
      ALTER TABLE fragments_new RENAME TO fragments;

      -- 重建索引
      CREATE INDEX IF NOT EXISTS fragments_server_id_idx ON fragments(server_id);
      CREATE INDEX IF NOT EXISTS fragments_folder_id_idx ON fragments(folder_id);
      CREATE INDEX IF NOT EXISTS fragments_updated_at_idx ON fragments(updated_at DESC);
    `);
  }

  // Version 3: 为 local-first 真值补充备份元数据
  if (currentVersion < 3) {
    await database.execAsync(`
      ALTER TABLE fragments ADD COLUMN backup_status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE fragments ADD COLUMN last_backup_at TEXT;
      ALTER TABLE fragments ADD COLUMN entity_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE fragments ADD COLUMN last_modified_device_id TEXT;

      ALTER TABLE fragment_folders ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE fragment_folders ADD COLUMN deleted_at TEXT;
      ALTER TABLE fragment_folders ADD COLUMN backup_status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE fragment_folders ADD COLUMN last_backup_at TEXT;
      ALTER TABLE fragment_folders ADD COLUMN entity_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE fragment_folders ADD COLUMN last_modified_device_id TEXT;

      ALTER TABLE media_assets ADD COLUMN deleted_at TEXT;
      ALTER TABLE media_assets ADD COLUMN backup_status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE media_assets ADD COLUMN last_backup_at TEXT;
      ALTER TABLE media_assets ADD COLUMN entity_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE media_assets ADD COLUMN last_modified_device_id TEXT;
    `);
  }

  // Version 4: 为 fragment 音频补充稳定对象键，供恢复时刷新访问地址
  if (currentVersion < 4) {
    await database.execAsync(`
      ALTER TABLE fragments ADD COLUMN audio_object_key TEXT;
    `);
  }

  await database.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
}
