import { API_ENDPOINTS } from '@/constants/config';
import { buildMultipartFilePart } from '@/features/core/files/runtime';
import { post, get, sendForm } from '@/features/core/api/client';
import type { ScriptCopyReason, ScriptGenerationKind, ScriptMode } from '@/types/script';

/* 备份协议里的 fragment payload，统一承接碎片正文与 local-first 资产状态。 */
export type BackupFragmentContractPayload = Record<string, unknown> & {
  id: string;
  folder_id: string | null;
  source: string;
  audio_source: string | null;
  created_at: string;
  updated_at: string;
  summary: string | null;
  tags: string[];
  system_purpose: string | null;
  user_purpose: string | null;
  system_tags: string[];
  user_tags: string[];
  dismissed_system_tags: string[];
  transcript: string | null;
  speaker_segments: unknown[] | null;
  audio_object_key: string | null;
  audio_file_url: string | null;
  audio_file_expires_at: string | null;
  body_html: string;
  plain_text_snapshot: string;
  content_state: string | null;
  is_filmed: boolean;
  filmed_at: string | null;
  deleted_at: string | null;
};

/* 备份协议里的 folder payload，统一承接文件夹名称与 local-first 备份元数据。 */
export type BackupFolderContractPayload = Record<string, unknown> & {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/* 备份协议里的媒体 payload，承接备份对象键与恢复所需文件元数据。 */
export type BackupMediaAssetContractPayload = Record<string, unknown> & {
  id: string;
  fragment_id: string;
  media_kind: 'image' | 'audio' | 'file';
  mime_type: string;
  file_name: string;
  backup_object_key: string | null;
  backup_file_url: string | null;
  remote_expires_at: string | null;
  upload_status: string;
  file_size: number;
  checksum: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
  deleted_at: string | null;
};

/* 备份协议里的 script payload，统一承接成稿正文、本地资产状态与来源关系。 */
export type BackupScriptContractPayload = Record<string, unknown> & {
  id: string;
  title: string | null;
  mode: ScriptMode;
  generation_kind: ScriptGenerationKind;
  source_fragment_ids: string[];
  is_daily_push: boolean;
  created_at: string;
  updated_at: string;
  generated_at: string;
  body_html: string;
  plain_text_snapshot: string;
  is_filmed: boolean;
  filmed_at: string | null;
  copy_of_script_id: string | null;
  copy_reason: ScriptCopyReason | null;
  trashed_at: string | null;
  deleted_at: string | null;
};

export type BackupContractPayload =
  | BackupFragmentContractPayload
  | BackupFolderContractPayload
  | BackupMediaAssetContractPayload
  | BackupScriptContractPayload;

export interface BackupMutationItem<TPayload extends Record<string, unknown> | null = Record<string, unknown> | null> {
  entity_type: 'fragment' | 'folder' | 'media_asset' | 'script';
  entity_id: string;
  entity_version: number;
  operation: 'upsert' | 'delete';
  payload: TPayload;
  modified_at?: string | null;
  last_modified_device_id?: string | null;
}

export interface BackupBatchResponse {
  accepted_count: number;
  ignored_count: number;
  server_generated_at: string;
}

export interface BackupSnapshotItem<TPayload extends Record<string, unknown> | null = Record<string, unknown> | null> {
  entity_type: string;
  entity_id: string;
  entity_version: number;
  operation: string;
  payload: TPayload;
  modified_at?: string | null;
  last_modified_device_id?: string | null;
  updated_at?: string | null;
}

export interface BackupSnapshotResponse {
  items: BackupSnapshotItem[];
  server_generated_at: string;
}

export interface BackupAssetHandle {
  storage_provider: string;
  bucket: string;
  object_key: string;
  access_level: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  checksum: string | null;
  file_url: string;
  expires_at: string | null;
}

export interface BackupAssetAccessItem {
  object_key: string;
  file_url: string;
  expires_at: string | null;
}

export interface BackupAssetAccessResponse {
  items: BackupAssetAccessItem[];
}

export async function pushBackupBatch(items: BackupMutationItem[]): Promise<BackupBatchResponse> {
  return post<BackupBatchResponse>(API_ENDPOINTS.BACKUPS.BATCH, { items });
}

export async function fetchBackupSnapshot(sinceUpdatedAt?: string): Promise<BackupSnapshotResponse> {
  const endpoint = sinceUpdatedAt
    ? `${API_ENDPOINTS.BACKUPS.SNAPSHOT}?since_updated_at=${encodeURIComponent(sinceUpdatedAt)}`
    : API_ENDPOINTS.BACKUPS.SNAPSHOT;
  return get<BackupSnapshotResponse>(endpoint);
}

export async function createRestoreSession(reason?: string): Promise<{
  restore_session_id: string;
  snapshot_generated_at: string;
  total_items: number;
}> {
  return post(API_ENDPOINTS.BACKUPS.RESTORE, { reason: reason ?? null });
}

export async function uploadBackupAsset(input: {
  uri: string;
  fileName: string;
  mimeType: string;
  entityType: 'fragment' | 'folder' | 'media_asset';
  entityId: string;
}): Promise<BackupAssetHandle> {
  const formData = new FormData();
  formData.append(
    'file',
    buildMultipartFilePart({
      uri: input.uri,
      name: input.fileName,
      mimeType: input.mimeType,
      size: 0,
      kind: 'image',
      source: 'picker',
    }) as never
  );
  formData.append('entity_type', input.entityType);
  formData.append('entity_id', input.entityId);
  return sendForm<BackupAssetHandle>(API_ENDPOINTS.BACKUPS.ASSETS, 'POST', formData);
}

export async function refreshBackupAssetAccess(
  objectKeys: string[]
): Promise<BackupAssetAccessResponse> {
  return post<BackupAssetAccessResponse>(API_ENDPOINTS.BACKUPS.ASSET_ACCESS, {
    items: objectKeys.map((objectKey) => ({ object_key: objectKey })),
  });
}
