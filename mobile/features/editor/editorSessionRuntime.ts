import { useRef } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import type { EditorMediaAsset, EditorSurfaceHandle } from '@/features/editor/types';
import type { EditorSessionState } from '@/features/editor/sessionState';
import type { PendingImageAsset } from '@/features/editor/useEditorSession.types';

/*把正文会话里需要跨 effect / callback 读取的实时引用集中管理。 */
export interface EditorSessionRuntimeRefs<TDocument> {
  editorRef: React.RefObject<EditorSurfaceHandle | null>;
  stateRef: React.MutableRefObject<EditorSessionState>;
  documentRef: React.MutableRefObject<TDocument | null>;
  documentIdRef: React.MutableRefObject<string | null>;
  commitOptimisticRef: React.MutableRefObject<((doc: TDocument) => Promise<void>) | undefined>;
}

/*在渲染期同步刷新关键 ref，确保保存与后台事件永远读到当前帧状态。 */
export function useEditorSessionRuntimeRefs<TDocument>(input: {
  state: EditorSessionState;
  document: TDocument | null;
  documentId: string | null;
  commitOptimistic?: (doc: TDocument) => Promise<void>;
}): EditorSessionRuntimeRefs<TDocument> {
  const editorRef = useRef<EditorSurfaceHandle | null>(null);
  const stateRef = useRef(input.state);
  const documentRef = useRef(input.document);
  const documentIdRef = useRef(input.documentId);
  const commitOptimisticRef = useRef(input.commitOptimistic);

  stateRef.current = input.state;
  documentRef.current = input.document;
  documentIdRef.current = input.documentId;
  commitOptimisticRef.current = input.commitOptimistic;

  return {
    editorRef,
    stateRef,
    documentRef,
    documentIdRef,
    commitOptimisticRef,
  };
}

/*把本地 staging 图片适配成富文本桥接可直接消费的媒体对象。 */
export function buildLocalMediaAssetFromPendingImage(input: {
  asset: DocumentPicker.DocumentPickerAsset;
  pendingAsset: PendingImageAsset;
}): EditorMediaAsset {
  return {
    id: input.pendingAsset.local_asset_id,
    media_kind: 'image',
    original_filename: input.asset.name ?? 'image.jpg',
    mime_type: input.asset.mimeType ?? 'image/jpeg',
    file_size: 0,
    checksum: null,
    width: null,
    height: null,
    duration_ms: null,
    status: input.pendingAsset.upload_status,
    created_at: null,
    file_url: input.asset.uri,
    expires_at: null,
  };
}
