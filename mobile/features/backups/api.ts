import { API_ENDPOINTS } from '@/constants/config';
import { buildMultipartFilePart } from '@/features/core/files/runtime';
import { post, get, sendForm } from '@/features/core/api/client';

/* 备份协议里的 fragment payload，保留 legacy 绑定字段以兼容现有服务端快照。 */
export type BackupFragmentContractPayload = Record<string, unknown> & {
  id: string;
  server_id: string | null;
  folder_id: string | null;
  source: string;
  audio_source: string | null;
  created_at: string;
  updated_at: string;
  summary: string | null;
  tags: string[];
  transcript: string | null;
  speaker_segments: unknown[] | null;
  audio_object_key: string | null;
  audio_file_url: string | null;
  audio_file_expires_at: string | null;
  body_html: string;
  plain_text_snapshot: string;
  content_state: string | null;
  deleted_at: string | null;
};

/* 备份协议里的 folder payload，remote_id 仅作兼容字段保留。 */
export type BackupFolderContractPayload = Record<string, unknown> & {
  id: string;
  remote_id?: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/* 备份协议里的媒体 payload，兼容历史 remote_asset_id / 备份对象键。 */
export type BackupMediaAssetContractPayload = Record<string, unknown> & {
  id: string;
  fragment_id: string;
  media_kind: 'image' | 'audio' | 'file';
  mime_type: string;
  file_name: string;
  backup_object_key: string | null;
  backup_file_url: string | null;
  remote_asset_id?: string | null;
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

export type BackupContractPayload =
  | BackupFragmentContractPayload
  | BackupFolderContractPayload
  | BackupMediaAssetContractPayload;

export interface BackupMutationItem<TPayload extends Record<string, unknown> | null = Record<string, unknown> | null> {
  entity_type: 'fragment' | 'folder' | 'media_asset';
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
