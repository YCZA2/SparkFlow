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

export type LocalFragmentSyncStatus =
  | 'creating'
  | 'syncing'
  | 'synced'
  | 'failed_pending_retry';

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

export interface LocalFragmentDraft {
  local_id: string;
  remote_id?: string | null;
  folder_id?: string | null;
  body_markdown: string;
  plain_text_snapshot: string;
  created_at: string;
  sync_status: LocalFragmentSyncStatus;
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
  folder_id?: string | null;
  folder?: FragmentFolder | null;
  body_markdown: string;
  plain_text_snapshot?: string | null;
  content_state?: 'empty' | 'transcript_only' | 'body_present';
  media_assets?: MediaAsset[];
  /*前端本地优先视图字段，不属于后端 DTO。 */
  local_id?: string | null;
  remote_id?: string | null;
  is_local_draft?: boolean;
  local_sync_status?: LocalFragmentSyncStatus | null;
  display_source_label?: string | null;
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

export type EditorSessionPhase =
  | 'booting'
  | 'hydrating'
  | 'ready'
  | 'saving'
  | 'error';

export interface EditorSessionSnapshot extends FragmentEditorSnapshot {}

export interface SessionBaseline {
  fragment_id: string;
  snapshot: EditorSessionSnapshot;
  remote_baseline: string;
  cached_body_markdown: string | null;
  draft_markdown: string | null;
  media_assets: MediaAsset[];
  is_local_first: boolean;
  sync_status: LocalFragmentSyncStatus | FragmentSyncStatus;
}

export type FragmentEditorCommand =
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'bold'
  | 'italic'
  | 'undo'
  | 'redo';

export type FragmentEditorBlockType =
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList';

export interface FragmentEditorFormattingState {
  block_type: FragmentEditorBlockType;
  bold: boolean;
  italic: boolean;
  bullet_list: boolean;
  ordered_list: boolean;
  blockquote: boolean;
  can_undo: boolean;
  can_redo: boolean;
}

export interface EditorBridgeAdapter {
  getSnapshot: () => FragmentEditorSnapshot | null;
  focus: () => void;
  insertImage: (asset: MediaAsset) => void;
  applyPatch: (patch: FragmentAiPatch) => void;
  runCommand: (command: FragmentEditorCommand) => void;
}

export interface FragmentSaveAdapter {
  saveSnapshot: (
    fragment: Fragment,
    snapshot: FragmentEditorSnapshot
  ) => Promise<{
    fragment?: Fragment;
    saved_markdown: string;
  }>;
}

type FragmentSyncStatus = 'idle' | 'syncing' | 'synced' | 'unsynced';
