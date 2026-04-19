/**
 * 通用编辑器会话 Hook
 *
 * 负责组装共享正文会话的状态机、持久化副作用和图片插入能力。
 * 供碎片编辑、脚本编辑等场景复用。
 */

import { useCallback, useReducer, useRef, useState } from 'react';

import {
  createInitialEditorSessionState,
  reduceEditorSession,
} from '@/features/editor/sessionState';
import type {
  EditorDocumentSnapshot,
  EditorFormattingState,
  EditorSourceDocument,
} from '@/features/editor/types';
import { useEditorSessionHydration } from '@/features/editor/useEditorSessionHydration';
import { useEditorSessionImageInsertion } from '@/features/editor/useEditorSessionImageInsertion';
import { useEditorSessionPersistence } from '@/features/editor/useEditorSessionPersistence';
import type {
  EditorSessionConfig,
  EditorSessionResult,
  ImagePayload,
  PendingImageAsset,
} from '@/features/editor/useEditorSession.types';
import { useEditorSessionRuntimeRefs } from '@/features/editor/editorSessionRuntime';

export type {
  EditorSessionConfig,
  EditorSessionResult,
  ImagePayload,
  PendingImageAsset,
} from '@/features/editor/useEditorSession.types';

// ============================================================================
// 通用编辑器会话 Hook
// ============================================================================

export function useEditorSession<TDocument>(
  config: EditorSessionConfig<TDocument>
): EditorSessionResult<TDocument> {
  const {
    documentId,
    document,
    buildSourceDocument,
    loadPendingBody,
    loadBaseline,
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
    createInitialEditorSessionState
  );

  // 格式化状态脱离 reducer，避免每次按键都触发整棵树重渲染
  const [formattingState, setFormattingState] = useState<EditorFormattingState | null>(null);
  // 选区文本存 ref 供未来 AI 功能使用，不写入 reducer 避免光标移动触发 state 更新
  const selectionRef = useRef<string>('');
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const refs = useEditorSessionRuntimeRefs({
    state,
    document,
    documentId,
    commitOptimistic,
  });

  const getLiveSnapshot = useCallback((): EditorDocumentSnapshot => {
    const snapshot = refs.editorRef.current?.getSnapshot?.();
    return snapshot ?? refs.stateRef.current.snapshot;
  }, [refs.editorRef, refs.stateRef]);

  useEditorSessionHydration({
    documentId,
    document,
    buildSourceDocument,
    loadPendingBody,
    loadBaseline,
    dispatch,
    resetUiState: useCallback(() => {
      setIsEditorFocused(false);
      setFormattingState(null);
    }, []),
  });

  const { saveNow } = useEditorSessionPersistence({
    state,
    dispatch,
    refs,
    buildSourceDocument,
    saveLocally,
    shouldSaveOnBackground,
  });

  const { isUploadingImage, onInsertImage } = useEditorSessionImageInsertion({
    supportsImages,
    uploadImageAsset,
    attachPendingLocalImage,
    refs,
    dispatch,
    getLiveSnapshot,
  });

  const onSnapshotChange = useCallback((snapshot: EditorDocumentSnapshot) => {
    dispatch({ type: 'SNAPSHOT_CHANGED', snapshot });
  }, []);

  const onSelectionChange = useCallback((text: string) => {
    selectionRef.current = text.trim();
  }, []);

  const onFormattingStateChange = useCallback((nextState: EditorFormattingState) => {
    setFormattingState(nextState);
  }, []);

  const onEditorReady = useCallback(() => {
    dispatch({ type: 'EDITOR_READY' });
  }, []);

  const onEditorFocus = useCallback(() => {
    /*编辑器聚焦时上报编辑态，供页面按 iOS 备忘录语义切换顶部操作按钮。 */
    setIsEditorFocused(true);
  }, []);

  const onEditorBlur = useCallback(() => {
    setIsEditorFocused(false);
    if (shouldSaveOnBlur) {
      void saveNow().catch(() => undefined);
    }
  }, [saveNow, shouldSaveOnBlur]);

  const shouldAutoFocus = determineAutoFocus
    ? determineAutoFocus(state.snapshot, document)
    : false;

  const statusLabel = (() => {
    if (!state.isPendingBodyHydrated || !state.isEditorReady) return null;

    if (state.errorMessage || state.syncStatus === 'unsynced') {
      return '已保存在本地，稍后同步';
    }

    return null;
  })();

  /*给原生富文本桥接一个稳定初始值，只在 hydrate / 保存落盘后再更新，避免输入中回灌正文。 */
  const initialBodyHtml = state.baseline?.snapshot.body_html ?? state.snapshot.body_html;

  return {
    editorRef: refs.editorRef,
    editorKey: state.editorKey,
    initialBodyHtml,
    shouldAutoFocus,
    mediaAssets: state.mediaAssets,
    formattingState,
    isPendingBodyHydrated: state.isPendingBodyHydrated,
    isEditorFocused,
    statusLabel,
    isUploadingImage,
    saveNow,
    onEditorFocus,
    onEditorBlur,
    onEditorReady,
    onSnapshotChange,
    onSelectionChange,
    onFormattingStateChange,
    onInsertImage,
  };
}
