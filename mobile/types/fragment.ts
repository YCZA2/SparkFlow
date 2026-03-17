/**
 * 碎片笔记类型定义
 */

import type { FragmentFolder } from './folder';

export type FragmentSource = 'voice' | 'manual' | 'video_parse';
export type FragmentAudioSource = 'upload' | 'external_link';

export interface SpeakerSegment {
  speaker_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface MediaAsset {
  id: string;
  media_kind: 'image' | 'audio' | 'file';
  original_filename: string;
  mime_type: string;
  file_size: number;
  checksum: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  status: string;
  created_at: string | null;
  file_url?: string | null;
  expires_at?: string | null;
}

/* 旧云端绑定状态，仅保留给兼容字段 sync_status 使用。 */
export type LegacyCloudBindingStatus = 'pending' | 'synced';

export type LocalPendingImageUploadStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'failed_pending_retry';

export interface LocalPendingImageAsset {
  local_asset_id: string;
  local_fragment_id: string;
  local_uri: string;
  mime_type: string;
  file_name: string;
  remote_asset_id?: string | null;
  upload_status: LocalPendingImageUploadStatus;
}

/* 旧版本地草稿结构，仅用于升级迁移与兼容态判断。 */
export interface LegacyLocalFragmentDraft {
  id: string;
  server_id?: string | null;
  folder_id?: string | null;
  body_html: string;
  plain_text_snapshot: string;
  created_at: string;
  updated_at: string;
  sync_status: LegacyCloudBindingStatus;
  last_sync_attempt_at?: string | null;
  next_retry_at?: string | null;
  retry_count?: number;
  pending_image_assets?: LocalPendingImageAsset[];
}

/**
 * 碎片笔记数据模型
 */
export interface Fragment {
  id: string;
  audio_file_url: string | null;
  audio_file_expires_at?: string | null;
  transcript: string | null;
  speaker_segments: SpeakerSegment[] | null;
  summary: string | null;
  tags: string[] | null;
  source: FragmentSource;
  audio_source?: FragmentAudioSource | null;
  created_at: string;
  updated_at: string;
  folder_id?: string | null;
  folder?: FragmentFolder | null;
  body_html: string;
  plain_text_snapshot?: string | null;
  content_state?: 'empty' | 'transcript_only' | 'body_present';
  media_assets?: MediaAsset[];
  /* 兼容字段：旧云端业务记录 ID，local-first 主链路不再把它当主键。 */
  server_id?: string | null;
  /* 兼容字段：旧云端绑定状态，仅供迁移期逻辑判断。 */
  sync_status?: LegacyCloudBindingStatus;
  audio_object_key?: string | null;
  backup_status?: 'pending' | 'synced' | 'failed';
  entity_version?: number;
  last_backup_at?: string | null;
  deleted_at?: string | null;
  is_filmed?: boolean;
  filmed_at?: string | null;
}

export interface FragmentListResponse {
  items: Fragment[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateFragmentRequest {
  transcript?: string;
  body_html?: string;
  summary?: string;
  tags?: string[];
  source?: FragmentSource;
  folder_id?: string;
  media_asset_ids?: string[];
}

export interface FragmentVisualizationPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  transcript: string | null;
  summary: string | null;
  tags: string[] | null;
  source: FragmentSource;
  created_at: string | null;
  cluster_id: number | null;
  is_noise: boolean;
}

export interface FragmentVisualizationCentroid {
  x: number;
  y: number;
  z: number;
}

export interface FragmentVisualizationCluster {
  id: number;
  label: string;
  keywords: string[];
  fragment_count: number;
  centroid: FragmentVisualizationCentroid;
}

export interface FragmentVisualizationStats {
  total_fragments: number;
  clustered_fragments: number;
  uncategorized_fragments: number;
}

export interface FragmentVisualizationMeta {
  projection: string;
  clustering: string;
  used_vector_source: string;
}

export interface FragmentVisualizationResponse {
  points: FragmentVisualizationPoint[];
  clusters: FragmentVisualizationCluster[];
  stats: FragmentVisualizationStats;
  meta: FragmentVisualizationMeta;
}
