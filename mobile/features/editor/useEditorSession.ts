/**
 * 通用编辑器会话 Hook
 *
 * 提供编辑器会话的通用逻辑，包括状态管理、ref 同步、保存逻辑等。
 * 供碎片编辑、脚本编辑等场景复用。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import {
  appendImageToSnapshot,
  buildEditorDocumentSnapshot,
  createInitialEditorSessionState,
  reduceEditorSession,
  shouldPublishOptimisticDocument,
} from '@/features/editor/sessionState';
import type {
  EditorDocumentSnapshot,
  EditorFormattingState,
  EditorMediaAsset,
  EditorPersistenceMode,
  EditorSourceDocument,
  EditorSurfaceHandle,
} from '@/features/editor/types';
import { normalizeBodyHtml } from '@/features/editor/html';

// ============================================================================
// 类型定义
// ============================================================================

export interface EditorSessionConfig<TDocument> {
  // 基础配置
  documentId: string | null;
  document: TDocument | null;
  persistenceMode: EditorPersistenceMode;
  buildSourceDocument: (doc: TDocument) => EditorSourceDocument;

  // 持久化钩子
  loadLocalDraft?: (id: string) => Promise<string | null>;
  loadCache?: (id: string) => Promise<string | null>;
  saveLocally?: (id: string, snapshot: EditorDocumentSnapshot) => Promise<void>;
  commitOptimistic?: (doc: TDocument) => Promise<void>;

  // 功能开关
  supportsImages?: boolean;
  determineAutoFocus?: (snapshot: EditorDocumentSnapshot, document: TDocument | null) => boolean;

  // 图片上传（可选）
  uploadImageAsset?: (uri: string, name: string, mimeType: string) => Promise<EditorMediaAsset>;
  attachPendingLocalImage?: (localId: string, payload: ImagePayload) => Promise<PendingImageAsset | null>;

  // 行为配置
  shouldSaveOnBackground?: boolean;
  shouldSaveOnBlur?: boolean;
}

export interface ImagePayload {
  local_uri: string;
  file_name: string;
  mime_type: string;
}

export interface PendingImageAsset {
  local_asset_id: string;
  local_fragment_id?: string;
  local_uri: string;
  mime_type: string;
  file_name: string;
  remote_asset_id?: string | null;
  upload_status: string;
}

export interface EditorSessionResult<TDocument = any> {
  editorRef: React.RefObject<EditorSurfaceHandle | null>;
  editorKey: string;
  initialBodyHtml: string;
  shouldAutoFocus: boolean;
  mediaAssets: EditorMediaAsset[];
  formattingState: EditorFormattingState | null;
  isDraftHydrated: boolean;
  statusLabel: string | null;
  isUploadingImage: boolean;
  saveNow: (options?: { force?: boolean }) => Promise<void>;
  onEditorBlur: () => void;
  onEditorReady: () => void;
  onSnapshotChange: (snapshot: EditorDocumentSnapshot) => void;
  onSelectionChange: (text: string) => void;
  onFormattingStateChange: (state: EditorFormattingState) => void;
  onInsertImage?: () => Promise<void>;
}

// ============================================================================
// 辅助函数
// ============================================================================

function buildLocalMediaAssetFromPendingImage(input: {
  asset: DocumentPicker.DocumentPickerAsset;
  pendingAssetId: string;
  uploadStatus: string;
}): EditorMediaAsset {
  return {
    id: input.pendingAssetId,
    media_kind: 'image',
    original_filename: input.asset.name ?? 'image.jpg',
    mime_type: input.asset.mimeType ?? 'image/jpeg',
    file_size: 0,
    checksum: null,
    width: null,
    height: null,
    duration_ms: null,
    status: input.uploadStatus,
    created_at: null,
    file_url: input.asset.uri,
    expires_at: null,
  };
}

// ============================================================================
// 通用编辑器会话 Hook
// ============================================================================

export function useEditorSession<TDocument>(
  config: EditorSessionConfig<TDocument>
): EditorSessionResult<TDocument> {
  const {
    documentId,
    document,
    persistenceMode,
    buildSourceDocument,
    loadLocalDraft,
    loadCache,
    saveLocally,
    commitOptimistic,
    supportsImages = false,
    determineAutoFocus,
    uploadImageAsset,
    attachPendingLocalImage,
    shouldSaveOnBackground = true,
    shouldSaveOnBlur = true,
  } = config;

  // 状态机
  const [state, dispatch] = useReducer(
    reduceEditorSession,
    documentId,
    (initialId) => createInitialEditorSessionState(initialId, persistenceMode)
  );

  // 图片上传状态
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Refs
  const editorRef = useRef<EditorSurfaceHandle | null>(null);
  const stateRef = useRef(state);
  const documentRef = useRef(document);
  const documentIdRef = useRef(documentId);
  const commitOptimisticRef = useRef(commitOptimistic);

  // 同步 refs
  useEffect(() => {
    stateRef.current = state;
    documentRef.current = document;
    documentIdRef.current = documentId;
    commitOptimisticRef.current = commitOptimistic;
  }, [commitOptimistic, document, documentId, state]);

  // 重置会话
  useEffect(() => {
    dispatch({
      type: 'RESET_SESSION',
      documentId,
      persistenceMode,
    });
  }, [documentId, persistenceMode]);

  // 加载本地草稿
  useEffect(() => {
    if (!documentId || !loadLocalDraft) {
      dispatch({ type: 'LOCAL_DRAFT_HTML_LOADED', html: null });
      return;
    }

    let cancelled = false;
    void (async () => {
      const draftHtml = await loadLocalDraft(documentId);
      if (cancelled) return;
      dispatch({ type: 'LOCAL_DRAFT_HTML_LOADED', html: draftHtml });
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, loadLocalDraft]);

  // 加载缓存
  useEffect(() => {
    if (!documentId || !loadCache) {
      dispatch({ type: 'CACHED_BASELINE_LOADED', html: null });
      return;
    }

    let cancelled = false;
    void (async () => {
      const cachedHtml = await loadCache(documentId);
      if (cancelled) return;
      dispatch({ type: 'CACHED_BASELINE_LOADED', html: cachedHtml });
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, loadCache]);

  // 加载来源文档
  useEffect(() => {
    dispatch({
      type: 'SOURCE_DOCUMENT_LOADED',
      document: document ? buildSourceDocument(document) : null,
    });
  }, [buildSourceDocument, document]);

  // 乐观更新
  useEffect(() => {
    const currentDocument = documentRef.current;
    if (!currentDocument || !shouldPublishOptimisticDocument(state)) return;

    if (commitOptimisticRef.current) {
      void commitOptimisticRef.current(currentDocument).catch(() => undefined);
    }
  }, [state]);

  // 获取实时快照
  const getLiveSnapshot = useCallback((): EditorDocumentSnapshot => {
    const snapshot = editorRef.current?.getSnapshot?.();
    return snapshot ?? stateRef.current.snapshot;
  }, []);

  // 保存
  const saveNow = useCallback(
    async (options?: { force?: boolean }) => {
      const currentDocument = documentRef.current;
      const currentDocumentId = documentIdRef.current;
      if (!currentDocument || !currentDocumentId) return;

      const latestSnapshot = getLiveSnapshot();
      const baselineBodyHtml = normalizeBodyHtml(
        stateRef.current.baseline?.baseline_body_html ?? buildSourceDocument(currentDocument).body_html
      );

      if (!options?.force && normalizeBodyHtml(latestSnapshot.body_html) === baselineBodyHtml) {
        return;
      }

      dispatch({ type: 'SAVE_STARTED' });

      try {
        if (saveLocally) {
          await saveLocally(currentDocumentId, latestSnapshot);
          dispatch({
            type: 'LOCAL_SAVE_SUCCEEDED',
            document: buildSourceDocument(currentDocument),
            savedHtml: latestSnapshot.body_html,
          });
        }
      } catch (error) {
        dispatch({
          type: 'SAVE_FAILED',
          attemptedHtml: latestSnapshot.body_html,
          message: error instanceof Error ? error.message : '保存失败',
        });
        throw error;
      }
    },
    [buildSourceDocument, getLiveSnapshot, saveLocally]
  );

  // 图片插入
  const onInsertImage = useCallback(async () => {
    if (!supportsImages) return;

    try {
      setIsUploadingImage(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      const currentDocumentId = documentIdRef.current;
      if (!asset?.uri || !currentDocumentId) return;

      let mediaAsset: EditorMediaAsset;

      // 本地草稿路径
      if (attachPendingLocalImage) {
        const pendingAsset = await attachPendingLocalImage(currentDocumentId, {
          local_uri: asset.uri,
          file_name: asset.name ?? 'image.jpg',
          mime_type: asset.mimeType ?? 'image/jpeg',
        });

        if (!pendingAsset) return;

        mediaAsset = buildLocalMediaAssetFromPendingImage({
          asset,
          pendingAssetId: pendingAsset.local_asset_id,
          uploadStatus: pendingAsset.upload_status,
        });
      }
      // 在线上传路径
      else if (uploadImageAsset) {
        mediaAsset = await uploadImageAsset(
          asset.uri,
          asset.name ?? 'image.jpg',
          asset.mimeType ?? 'image/jpeg'
        );
      } else {
        return;
      }

      dispatch({ type: 'IMAGE_UPLOADED', asset: mediaAsset });

      if (stateRef.current.isEditorReady) {
        editorRef.current?.insertImage(mediaAsset);
      } else {
        dispatch({
          type: 'SNAPSHOT_CHANGED',
          snapshot: appendImageToSnapshot(getLiveSnapshot(), mediaAsset),
        });
      }
    } finally {
      setIsUploadingImage(false);
    }
  }, [attachPendingLocalImage, getLiveSnapshot, supportsImages, uploadImageAsset]);

  // 回调函数
  const onSnapshotChange = useCallback((snapshot: EditorDocumentSnapshot) => {
    dispatch({ type: 'SNAPSHOT_CHANGED', snapshot });
  }, []);

  const onSelectionChange = useCallback((text: string) => {
    dispatch({ type: 'SELECTION_CHANGED', text });
  }, []);

  const onFormattingStateChange = useCallback((formattingState: EditorFormattingState) => {
    dispatch({ type: 'FORMATTING_CHANGED', formattingState });
  }, []);

  const onEditorReady = useCallback(() => {
    dispatch({ type: 'EDITOR_READY' });
  }, []);

  const onEditorBlur = useCallback(() => {
    if (shouldSaveOnBlur) {
      void saveNow().catch(() => undefined);
    }
  }, [saveNow, shouldSaveOnBlur]);

  // 应用后台保存
  useEffect(() => {
    if (!shouldSaveOnBackground) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void saveNow().catch(() => undefined);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [saveNow, shouldSaveOnBackground]);

  // 页面卸载前保存
  useEffect(() => {
    return () => {
      void saveNow().catch(() => undefined);
    };
  }, [saveNow]);

  // 自动聚焦判断
  const shouldAutoFocus = determineAutoFocus
    ? determineAutoFocus(state.snapshot, document)
    : false;

  // 状态标签
  const statusLabel = (() => {
    if (!state.isDraftHydrated || !state.isEditorReady) return null;

    if (state.errorMessage || state.syncStatus === 'unsynced') {
      return '已保存在本地，稍后同步';
    }

    return null;
  })();

  /*给原生富文本桥接一个稳定的初始值，只在 hydrate / 保存落盘后再更新，避免输入中反复回灌正文导致光标跳尾。 */
  const initialBodyHtml = state.baseline?.snapshot.body_html ?? state.snapshot.body_html;

  return {
    editorRef,
    editorKey: state.editorKey,
    initialBodyHtml,
    shouldAutoFocus,
    mediaAssets: state.mediaAssets,
    formattingState: state.formattingState,
    isDraftHydrated: state.isDraftHydrated,
    statusLabel,
    isUploadingImage,
    saveNow,
    onEditorBlur,
    onEditorReady,
    onSnapshotChange,
    onSelectionChange,
    onFormattingStateChange,
    onInsertImage: supportsImages ? onInsertImage : undefined,
  };
}
