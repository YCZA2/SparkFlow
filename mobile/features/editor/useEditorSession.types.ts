import type { RefObject } from 'react';

import type {
  EditorDocumentSnapshot,
  EditorFormattingState,
  EditorMediaAsset,
  EditorSourceDocument,
  EditorSurfaceHandle,
} from '@/features/editor/types';

/*定义共享编辑器会话的对外配置，供 fragment/script 等正文场景复用。 */
export interface EditorSessionConfig<TDocument> {
  documentId: string | null;
  document: TDocument | null;
  buildSourceDocument: (doc: TDocument) => EditorSourceDocument;
  loadPendingBody?: (id: string) => Promise<string | null>;
  loadBaseline?: (id: string) => Promise<string | null>;
  saveLocally?: (id: string, snapshot: EditorDocumentSnapshot) => Promise<void>;
  commitOptimistic?: (doc: TDocument) => Promise<void>;
  supportsImages?: boolean;
  determineAutoFocus?: (snapshot: EditorDocumentSnapshot, document: TDocument | null) => boolean;
  uploadImageAsset?: (uri: string, name: string, mimeType: string) => Promise<EditorMediaAsset>;
  attachPendingLocalImage?: (localId: string, payload: ImagePayload) => Promise<PendingImageAsset | null>;
  shouldSaveOnBackground?: boolean;
  shouldSaveOnBlur?: boolean;
}

/*统一图片插入流程里传给本地 staging 层的载荷。 */
export interface ImagePayload {
  local_uri: string;
  file_name: string;
  mime_type: string;
}

/*描述本地待上传图片在正文会话里的最小可见信息。 */
export interface PendingImageAsset {
  local_asset_id: string;
  local_fragment_id?: string;
  local_uri: string;
  mime_type: string;
  file_name: string;
  backup_object_key?: string | null;
  upload_status: string;
}

/*收敛页面层真正需要消费的会话输出，避免把内部 reducer 细节暴露出去。 */
export interface EditorSessionResult<TDocument = any> {
  editorRef: RefObject<EditorSurfaceHandle | null>;
  editorKey: string;
  initialBodyHtml: string;
  shouldAutoFocus: boolean;
  mediaAssets: EditorMediaAsset[];
  formattingState: EditorFormattingState | null;
  isPendingBodyHydrated: boolean;
  isEditorFocused: boolean;
  statusLabel: string | null;
  isUploadingImage: boolean;
  saveNow: (options?: { force?: boolean }) => Promise<void>;
  finishEditing: () => Promise<void>;
  onEditorFocus: () => void;
  onEditorBlur: () => void;
  onEditorReady: () => void;
  onSnapshotChange: (snapshot: EditorDocumentSnapshot) => void;
  onSelectionChange: (text: string) => void;
  onFormattingStateChange: (state: EditorFormattingState) => void;
  onInsertImage?: () => Promise<void>;
}
