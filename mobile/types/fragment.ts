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

/* 碎片同步状态 - 简化为两种状态 */
export type FragmentSyncStatus = 'pending' | 'synced';

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

/* 本地碎片草稿 - 使用统一 id */
export interface LocalFragmentDraft {
  id: string;
  server_id?: string | null;
  folder_id?: string | null;
  body_html: string;
  plain_text_snapshot: string;
  created_at: string;
  updated_at: string;
  sync_status: FragmentSyncStatus;
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
  /*前端本地优先视图字段，不属于后端 DTO。 */
  server_id?: string | null;
  sync_status?: FragmentSyncStatus;
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
