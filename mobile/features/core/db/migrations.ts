import type { SQLiteDatabase } from 'expo-sqlite';

const LATEST_SCHEMA_VERSION = 9;

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

  // Version 5: 为 script local-first 补齐本地真值表
  if (currentVersion < 5) {
    await database.execAsync(`
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

  // Version 6: 为 fragment 补充拍摄标记，和成稿保持统一消费语义
  if (currentVersion < 6) {
    await database.execAsync(`
      ALTER TABLE fragments ADD COLUMN is_filmed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE fragments ADD COLUMN filmed_at TEXT;
    `);
  }

  // Version 7: 清理 legacy 云端绑定列，local-first 主链路不再需要
  if (currentVersion < 7) {
    await database.execAsync(`
      CREATE TABLE fragments_v7 (
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
        deleted_at TEXT,
        is_filmed INTEGER NOT NULL DEFAULT 0,
        filmed_at TEXT,
        content_state TEXT,
        backup_status TEXT NOT NULL DEFAULT 'pending',
        last_backup_at TEXT,
        entity_version INTEGER NOT NULL DEFAULT 1,
        last_modified_device_id TEXT,
        cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO fragments_v7
        SELECT
          id, folder_id, source, audio_source, created_at, updated_at,
          summary, tags_json, plain_text_snapshot, body_file_uri, transcript,
          speaker_segments_json, audio_object_key, audio_file_uri, audio_file_url,
          audio_file_expires_at, deleted_at, is_filmed, filmed_at, content_state,
          backup_status, last_backup_at, entity_version, last_modified_device_id, cached_at
        FROM fragments;

      DROP TABLE fragments;
      ALTER TABLE fragments_v7 RENAME TO fragments;

      CREATE INDEX IF NOT EXISTS fragments_folder_id_idx ON fragments(folder_id);
      CREATE INDEX IF NOT EXISTS fragments_updated_at_idx ON fragments(updated_at DESC);

      CREATE TABLE fragment_folders_v7 (
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

      INSERT INTO fragment_folders_v7
        SELECT id, name, created_at, updated_at, deleted_at,
               backup_status, last_backup_at, entity_version, last_modified_device_id
        FROM fragment_folders;

      DROP TABLE fragment_folders;
      ALTER TABLE fragment_folders_v7 RENAME TO fragment_folders;
    `);
  }

  // Version 8: 删除 media_assets 中与 upload_status 语义重叠的冗余 status 列
  if (currentVersion < 8) {
    await database.execAsync(`
      CREATE TABLE media_assets_v8 (
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

      INSERT INTO media_assets_v8
        SELECT
          id, fragment_id, remote_asset_id, media_kind, mime_type, file_name,
          local_file_uri, remote_file_url, remote_expires_at, upload_status,
          file_size, checksum, width, height, duration_ms, created_at,
          deleted_at, backup_status, last_backup_at, entity_version, last_modified_device_id
        FROM media_assets;

      DROP TABLE media_assets;
      ALTER TABLE media_assets_v8 RENAME TO media_assets;

      CREATE INDEX IF NOT EXISTS media_assets_fragment_id_idx ON media_assets(fragment_id);
      CREATE INDEX IF NOT EXISTS media_assets_remote_asset_id_idx ON media_assets(remote_asset_id);
    `);
  }

  // Version 9: 为媒体导入型 fragment 补充本地 pipeline 运行态，供失败提示与刷新重试复用
  if (currentVersion < 9) {
    await database.execAsync(`
      ALTER TABLE fragments ADD COLUMN media_pipeline_run_id TEXT;
      ALTER TABLE fragments ADD COLUMN media_pipeline_status TEXT;
      ALTER TABLE fragments ADD COLUMN media_pipeline_error_message TEXT;
    `);
  }

  await database.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION};`);
}
