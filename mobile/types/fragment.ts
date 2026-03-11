/**
 * 碎片笔记类型定义
 */

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

export interface FragmentFolder {
  id: string;
  name: string;
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
  folder_id?: string | null;
  folder?: FragmentFolder | null;
  body_markdown: string;
  plain_text_snapshot?: string | null;
  content_state?: 'empty' | 'transcript_only' | 'body_present';
  media_assets?: MediaAsset[];
}

export interface FragmentListResponse {
  items: Fragment[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateFragmentRequest {
  transcript?: string;
  body_markdown?: string;
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

export interface FragmentAiPatch {
  op: 'replace_selection' | 'insert_after_selection' | 'prepend_document';
  markdown_snippet: string;
}

export interface FragmentEditorSnapshot {
  body_markdown: string;
  plain_text: string;
  asset_ids: string[];
}
