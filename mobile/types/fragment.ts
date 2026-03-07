/**
 * 碎片笔记类型定义
 */

export type FragmentSource = 'voice' | 'manual' | 'video_parse';
export type FragmentSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SpeakerSegment {
  speaker_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

/**
 * 碎片笔记数据模型
 */
export interface Fragment {
  /** 碎片ID */
  id: string;
  /** 音频文件路径 */
  audio_path: string | null;
  /** 转写文本 */
  transcript: string | null;
  /** 说话人分段 */
  speaker_segments: SpeakerSegment[] | null;
  /** AI一句话摘要 */
  summary: string | null;
  /** AI自动标签 */
  tags: string[] | null;
  /** 来源: voice | manual | video_parse */
  source: FragmentSource;
  /** 同步状态: pending | syncing | synced | failed */
  sync_status: FragmentSyncStatus;
  /** 创建时间 */
  created_at: string;
}

/**
 * 碎片列表分页响应
 */
export interface FragmentListResponse {
  /** 碎片列表 */
  items: Fragment[];
  /** 总数 */
  total: number;
  /** 分页限制 */
  limit: number;
  /** 偏移量 */
  offset: number;
}

/**
 * 创建碎片请求
 */
export interface CreateFragmentRequest {
  /** 转写文本 */
  transcript?: string;
  /** AI摘要 */
  summary?: string;
  /** AI标签 */
  tags?: string[];
  /** 来源 */
  source?: FragmentSource;
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
  sync_status: FragmentSyncStatus;
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
