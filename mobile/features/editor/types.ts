import type { LegacyCloudBindingStatus } from '@/types/fragment';

export type EditorPersistenceMode = 'local-first' | 'remote-only';

export type EditorSaveState = 'idle' | 'syncing' | 'synced' | 'unsynced';

export type EditorSessionPhase =
  | 'booting'
  | 'hydrating'
  | 'ready'
  | 'saving'
  | 'error';

export interface EditorCapabilities {
  supportsImages: boolean;
  supportsDetailSheet: boolean;
  supportsTitle: boolean;
  supportsAiTools: boolean;
}

export interface EditorDocumentSnapshot {
  body_html: string;
  plain_text: string;
  asset_ids: string[];
}

export interface EditorMediaAsset {
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

export interface EditorSourceDocument {
  id: string;
  body_html: string;
  media_assets?: EditorMediaAsset[];
  is_legacy_local_document?: boolean;
  legacy_cloud_binding_status?: LegacyCloudBindingStatus | null;
}

export interface EditorSessionBaseline {
  document_id: string;
  snapshot: EditorDocumentSnapshot;
  baseline_body_html: string;
  cached_baseline_html: string | null;
  local_draft_html: string | null;
  media_assets: EditorMediaAsset[];
  persistence_mode: EditorPersistenceMode;
  save_state: EditorSaveState;
}

export type EditorCommand =
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'bold'
  | 'italic'
  | 'undo'
  | 'redo';

export type EditorBlockType =
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList';

export interface EditorFormattingState {
  block_type: EditorBlockType;
  bold: boolean;
  italic: boolean;
  bullet_list: boolean;
  ordered_list: boolean;
  blockquote: boolean;
  can_undo: boolean;
  can_redo: boolean;
}

export interface EditorSurfaceHandle {
  getSnapshot: () => EditorDocumentSnapshot | null;
  focus: () => void;
  insertImage: (asset: EditorMediaAsset) => void;
  runCommand: (command: EditorCommand) => void;
}
