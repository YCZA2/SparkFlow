import type {
  BackupFolderContractPayload,
  BackupFragmentContractPayload,
  BackupMediaAssetContractPayload,
  BackupScriptContractPayload,
  BackupSnapshotResponse,
} from '@/features/backups/api';
import type { FragmentAudioSource, FragmentSource } from '@/types/fragment';

export interface RestoredFolderRow {
  id: string;
  legacyRemoteId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
  legacyCloudBindingStatus: 'synced';
  deletedAt: string | null;
  backupStatus: 'synced';
  lastBackupAt: string;
  entityVersion: number;
  lastModifiedDeviceId: string | null;
}

export interface RestoredFragmentRow {
  id: string;
  legacyServerBindingId: string | null;
  folderId: string | null;
  source: FragmentSource;
  audioSource: FragmentAudioSource | null;
  audioObjectKey: string | null;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
  tagsJson: string;
  plainTextSnapshot: string;
  bodyHtml: string;
  transcript: string | null;
  speakerSegmentsJson: string | null;
  audioFileUri: string | null;
  audioFileUrl: string | null;
  audioFileExpiresAt: string | null;
  legacyCloudBindingStatus: 'synced';
  lastSyncedAt: string;
  lastSyncAttemptAt: null;
  nextRetryAt: null;
  retryCount: number;
  deletedAt: string | null;
  isFilmed: number;
  filmedAt: string | null;
  backupStatus: 'synced';
  lastBackupAt: string;
  entityVersion: number;
  lastModifiedDeviceId: string | null;
  contentState: 'empty' | 'transcript_only' | 'body_present';
  cachedAt: string;
}

export interface RestoredMediaAssetRow {
  id: string;
  fragmentId: string;
  remoteAssetId: string | null;
  mediaKind: 'image' | 'audio' | 'file';
  mimeType: string;
  fileName: string;
  localFileUri: string | null;
  remoteFileUrl: string | null;
  remoteExpiresAt: string | null;
  uploadStatus: 'uploaded';
  fileSize: number;
  checksum: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  status: 'uploaded';
  createdAt: string;
  deletedAt: string | null;
  backupStatus: 'synced';
  lastBackupAt: string;
  entityVersion: number;
  lastModifiedDeviceId: string | null;
}

export interface BackupRestorePlan {
  folders: RestoredFolderRow[];
  fragments: RestoredFragmentRow[];
  mediaAssets: RestoredMediaAssetRow[];
  scripts: RestoredScriptRow[];
}

export interface RestoredScriptRow {
  id: string;
  title: string | null;
  mode: 'mode_a' | 'mode_b';
  generationKind: 'manual' | 'daily_push';
  sourceFragmentIdsJson: string;
  isDailyPush: number;
  createdAt: string;
  updatedAt: string;
  generatedAt: string;
  plainTextSnapshot: string;
  bodyHtml: string;
  bodyFileUri: string | null;
  isFilmed: number;
  filmedAt: string | null;
  copyOfScriptId: string | null;
  copyReason: 'conflict' | 'restore' | 'manual_duplicate' | null;
  trashedAt: string | null;
  deletedAt: string | null;
  backupStatus: 'synced';
  lastBackupAt: string;
  entityVersion: number;
  lastModifiedDeviceId: string | null;
  cachedAt: string;
}

function readString(value: unknown): string | null {
  /*统一把 snapshot payload 中的字符串字段收敛为可选字符串。 */
  return typeof value === 'string' && value.trim() ? value : null;
}

function readStringArray(value: unknown): string[] {
  /*仅接受字符串数组，避免脏数据污染本地 SQLite。 */
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readSpeakerSegments(value: unknown): string | null {
  /*说话人分段统一序列化成 JSON 文本落库。 */
  return Array.isArray(value) ? JSON.stringify(value) : null;
}

function resolveFragmentSource(value: unknown): FragmentSource {
  /*恢复时只允许受支持的 source 枚举，异常值回退为 manual。 */
  return value === 'voice' || value === 'manual' || value === 'video_parse' ? value : 'manual';
}

function resolveAudioSource(value: unknown): FragmentAudioSource | null {
  /*恢复时保留已知音频来源，其余值忽略。 */
  return value === 'upload' || value === 'external_link' ? value : null;
}

function resolveContentState(bodyHtml: string, transcript: string | null, value: unknown) {
  /*优先尊重备份里的 content_state，其次按正文和转写推断。 */
  if (value === 'empty' || value === 'transcript_only' || value === 'body_present') {
    return value;
  }
  if (bodyHtml.trim()) {
    return 'body_present';
  }
  if (transcript?.trim()) {
    return 'transcript_only';
  }
  return 'empty';
}

/*把远端 snapshot 规整成可直接重建本地 SQLite 的恢复计划。 */
export function buildBackupRestorePlan(snapshot: BackupSnapshotResponse): BackupRestorePlan {
  const plan: BackupRestorePlan = {
    folders: [],
    fragments: [],
    mediaAssets: [],
    scripts: [],
  };

  for (const item of snapshot.items) {
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const baseTimestamp =
      readString(payload.updated_at) ??
      item.modified_at ??
      readString(payload.created_at) ??
      snapshot.server_generated_at;
    const deletedAt =
      item.operation === 'delete'
        ? item.modified_at ?? readString(payload.deleted_at) ?? baseTimestamp
        : readString(payload.deleted_at);

    if (item.entity_type === 'folder') {
      const folderPayload = (item.payload ?? {}) as Partial<BackupFolderContractPayload>;
      plan.folders.push({
        id: item.entity_id,
        legacyRemoteId: readString(folderPayload.remote_id),
        name: readString(folderPayload.name) ?? '已删除文件夹',
        createdAt: readString(folderPayload.created_at) ?? baseTimestamp,
        updatedAt: baseTimestamp,
        legacyCloudBindingStatus: 'synced',
        deletedAt,
        backupStatus: 'synced',
        lastBackupAt: snapshot.server_generated_at,
        entityVersion: item.entity_version,
        lastModifiedDeviceId: item.last_modified_device_id ?? null,
      });
      continue;
    }

    if (item.entity_type === 'fragment') {
      const fragmentPayload = (item.payload ?? {}) as Partial<BackupFragmentContractPayload>;
      const bodyHtml = deletedAt ? '' : readString(fragmentPayload.body_html) ?? '';
      const transcript = readString(fragmentPayload.transcript);
      plan.fragments.push({
        id: item.entity_id,
        legacyServerBindingId: readString(fragmentPayload.server_id),
        folderId: readString(fragmentPayload.folder_id),
        source: resolveFragmentSource(fragmentPayload.source),
        audioSource: resolveAudioSource(fragmentPayload.audio_source),
        audioObjectKey: readString(fragmentPayload.audio_object_key),
        createdAt: readString(fragmentPayload.created_at) ?? baseTimestamp,
        updatedAt: baseTimestamp,
        summary: readString(fragmentPayload.summary),
        tagsJson: JSON.stringify(readStringArray(fragmentPayload.tags)),
        plainTextSnapshot: readString(fragmentPayload.plain_text_snapshot) ?? transcript ?? '',
        bodyHtml,
        transcript,
        speakerSegmentsJson: readSpeakerSegments(fragmentPayload.speaker_segments),
        audioFileUri: null,
        audioFileUrl: readString(fragmentPayload.audio_file_url),
        audioFileExpiresAt: readString(fragmentPayload.audio_file_expires_at),
        legacyCloudBindingStatus: 'synced',
        lastSyncedAt: snapshot.server_generated_at,
        lastSyncAttemptAt: null,
        nextRetryAt: null,
        retryCount: 0,
        deletedAt,
        isFilmed: fragmentPayload.is_filmed ? 1 : 0,
        filmedAt: readString(fragmentPayload.filmed_at),
        backupStatus: 'synced',
        lastBackupAt: snapshot.server_generated_at,
        entityVersion: item.entity_version,
        lastModifiedDeviceId: item.last_modified_device_id ?? null,
        contentState: resolveContentState(bodyHtml, transcript, fragmentPayload.content_state),
        cachedAt: snapshot.server_generated_at,
      });
      continue;
    }

    if (item.entity_type === 'media_asset') {
      const mediaPayload = (item.payload ?? {}) as Partial<BackupMediaAssetContractPayload>;
      plan.mediaAssets.push({
        id: item.entity_id,
        fragmentId: readString(mediaPayload.fragment_id) ?? '__deleted_fragment__',
        remoteAssetId:
          readString(mediaPayload.backup_object_key) ?? readString(mediaPayload.remote_asset_id),
        mediaKind:
          mediaPayload.media_kind === 'image' || mediaPayload.media_kind === 'audio'
            ? mediaPayload.media_kind
            : 'file',
        mimeType: readString(mediaPayload.mime_type) ?? 'application/octet-stream',
        fileName: readString(mediaPayload.file_name) ?? 'deleted.bin',
        localFileUri: null,
        remoteFileUrl: readString(mediaPayload.backup_file_url),
        remoteExpiresAt: readString(mediaPayload.remote_expires_at),
        uploadStatus: 'uploaded',
        fileSize: typeof mediaPayload.file_size === 'number' ? mediaPayload.file_size : 0,
        checksum: readString(mediaPayload.checksum),
        width: typeof mediaPayload.width === 'number' ? mediaPayload.width : null,
        height: typeof mediaPayload.height === 'number' ? mediaPayload.height : null,
        durationMs: typeof mediaPayload.duration_ms === 'number' ? mediaPayload.duration_ms : null,
        status: 'uploaded',
        createdAt: readString(mediaPayload.created_at) ?? baseTimestamp,
        deletedAt,
        backupStatus: 'synced',
        lastBackupAt: snapshot.server_generated_at,
        entityVersion: item.entity_version,
        lastModifiedDeviceId: item.last_modified_device_id ?? null,
      });
    }

    if (item.entity_type === 'script') {
      const scriptPayload = (item.payload ?? {}) as Partial<BackupScriptContractPayload>;
      const bodyHtml = deletedAt ? '' : readString(scriptPayload.body_html) ?? '';
      const createdAt = readString(scriptPayload.created_at) ?? baseTimestamp;
      plan.scripts.push({
        id: item.entity_id,
        title: readString(scriptPayload.title),
        mode: scriptPayload.mode === 'mode_b' ? 'mode_b' : 'mode_a',
        generationKind: scriptPayload.generation_kind === 'daily_push' ? 'daily_push' : 'manual',
        sourceFragmentIdsJson: JSON.stringify(readStringArray(scriptPayload.source_fragment_ids)),
        isDailyPush: scriptPayload.is_daily_push ? 1 : 0,
        createdAt,
        updatedAt: baseTimestamp,
        generatedAt: readString(scriptPayload.generated_at) ?? createdAt,
        plainTextSnapshot: readString(scriptPayload.plain_text_snapshot) ?? '',
        bodyHtml,
        bodyFileUri: null, // 由 mergeRestoredScriptRow 按 getScriptBodyFile 覆盖
        isFilmed: scriptPayload.is_filmed ? 1 : 0,
        filmedAt: readString(scriptPayload.filmed_at),
        copyOfScriptId: readString(scriptPayload.copy_of_script_id),
        copyReason:
          scriptPayload.copy_reason === 'conflict' || scriptPayload.copy_reason === 'restore' || scriptPayload.copy_reason === 'manual_duplicate'
            ? scriptPayload.copy_reason
            : null,
        trashedAt: readString(scriptPayload.trashed_at),
        deletedAt,
        backupStatus: 'synced',
        lastBackupAt: snapshot.server_generated_at,
        entityVersion: item.entity_version,
        lastModifiedDeviceId: item.last_modified_device_id ?? null,
        cachedAt: snapshot.server_generated_at,
      });
    }
  }

  return plan;
}
