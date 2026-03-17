/**
 * 编辑器会话状态机
 *
 * 使用 reducer 模式管理复杂的编辑器会话状态，提供单向数据流和可预测的状态转换。
 */

import {
  appendImageToSnapshot,
  appendRuntimeMediaAsset,
  buildEditorDocumentSnapshot,
  reconcileHydration,
  resolveEditorSessionBaseline,
  resolveSessionPhase,
} from './sessionHydration';
import { normalizeBodyHtml } from '@/features/editor/html';
import type {
  EditorDocumentSnapshot,
  EditorFormattingState,
  EditorMediaAsset,
  EditorPersistenceMode,
  EditorSaveState,
  EditorSessionBaseline,
  EditorSessionPhase,
  EditorSourceDocument,
} from './types';

// 重新导出供外部使用
export {
  appendImageToSnapshot,
  appendRuntimeMediaAsset,
  buildEditorDocumentSnapshot,
  mergeVisibleMediaAssets,
  resolveEditorSessionBaseline,
  resolveHydratedEditorDocument,
  shouldCommitOptimisticDocument,
  shouldProtectSuspiciousEmptySnapshot,
  shouldRehydrateEditorSession,
} from './sessionHydration';
export { applyHtmlPatchFallbackToSnapshot } from './sessionHydration';
export { shouldPublishOptimisticDocument } from './sessionPersistence';

// ============================================================================
// 会话状态类型定义
// ============================================================================

interface SessionSourceState {
  document: EditorSourceDocument | null;
  local_draft_html: string | null;
  local_draft_loaded: boolean;
  cached_baseline_html: string | null;
}

export interface EditorSessionState {
  documentId: string | null;
  editorKey: string;
  phase: EditorSessionPhase;
  baseline: EditorSessionBaseline | null;
  snapshot: EditorDocumentSnapshot;
  mediaAssets: EditorMediaAsset[];
  syncStatus: EditorSaveState;
  isEditorReady: boolean;
  isDraftHydrated: boolean;
  hasConfirmedLocalEdit: boolean;
  selectionText: string;
  formattingState: EditorFormattingState | null;
  errorMessage: string | null;
  saveRequestId: number;
  persistenceMode: EditorPersistenceMode;
  source: SessionSourceState;
}

export type EditorSessionEvent =
  | { type: 'RESET_SESSION'; documentId: string | null; persistenceMode: EditorPersistenceMode }
  | { type: 'LOCAL_DRAFT_HTML_LOADED'; html: string | null }
  | { type: 'CACHED_BASELINE_LOADED'; html: string | null }
  | { type: 'SOURCE_DOCUMENT_LOADED'; document: EditorSourceDocument | null }
  | { type: 'EDITOR_READY' }
  | { type: 'SNAPSHOT_CHANGED'; snapshot: EditorDocumentSnapshot }
  | { type: 'SELECTION_CHANGED'; text: string }
  | { type: 'FORMATTING_CHANGED'; formattingState: EditorFormattingState }
  | { type: 'IMAGE_UPLOADED'; asset: EditorMediaAsset }
  | { type: 'SAVE_REQUESTED' }
  | { type: 'SAVE_STARTED' }
  | { type: 'LOCAL_SAVE_SUCCEEDED'; document: EditorSourceDocument | null; savedHtml: string }
  | { type: 'SAVE_FAILED'; attemptedHtml: string; message: string | null };

// ============================================================================
// 会话状态初始化
// ============================================================================

/*为指定文档构造全新的编辑会话状态。 */
export function createInitialEditorSessionState(
  documentId: string | null,
  persistenceMode: EditorPersistenceMode
): EditorSessionState {
  return {
    documentId,
    editorKey: documentId ?? 'empty',
    phase: documentId ? 'booting' : 'hydrating',
    baseline: null,
    snapshot: buildEditorDocumentSnapshot(''),
    mediaAssets: [],
    syncStatus: 'idle',
    isEditorReady: false,
    isDraftHydrated: false,
    hasConfirmedLocalEdit: false,
    selectionText: '',
    formattingState: null,
    errorMessage: null,
    saveRequestId: 0,
    persistenceMode,
    source: {
      document: null,
      local_draft_html: null,
      local_draft_loaded: false,
      cached_baseline_html: null,
    },
  };
}

// ============================================================================
// 会话状态 Reducer
// ============================================================================

/*用单向事件流收敛正文会话状态，避免副作用互相覆盖。 */
export function reduceEditorSession(
  state: EditorSessionState,
  event: EditorSessionEvent
): EditorSessionState {
  if (event.type === 'RESET_SESSION') {
    return createInitialEditorSessionState(event.documentId, event.persistenceMode);
  }

  if (event.type === 'LOCAL_DRAFT_HTML_LOADED') {
    return reconcileHydration({
      ...state,
      source: {
        ...state.source,
        local_draft_loaded: true,
        local_draft_html: event.html,
      },
    });
  }

  if (event.type === 'CACHED_BASELINE_LOADED') {
    return reconcileHydration({
      ...state,
      source: {
        ...state.source,
        cached_baseline_html: event.html,
      },
    });
  }

  if (event.type === 'SOURCE_DOCUMENT_LOADED') {
    return reconcileHydration({
      ...state,
      source: {
        ...state.source,
        document: event.document,
      },
    });
  }

  if (event.type === 'EDITOR_READY') {
    return {
      ...state,
      isEditorReady: true,
      phase: resolveSessionPhase({
        ...state,
        isEditorReady: true,
      }),
    };
  }

  if (event.type === 'SNAPSHOT_CHANGED') {
    const hasMeaningfulChange =
      event.snapshot.body_html !== state.snapshot.body_html ||
      event.snapshot.asset_ids.join(',') !== state.snapshot.asset_ids.join(',');
    return {
      ...state,
      snapshot: event.snapshot,
      hasConfirmedLocalEdit: hasMeaningfulChange ? true : state.hasConfirmedLocalEdit,
      syncStatus: hasMeaningfulChange
        ? state.source.document?.legacy_save_state != null
          ? 'syncing'
          : state.syncStatus === 'synced'
            ? 'idle'
            : state.syncStatus
        : state.syncStatus,
      errorMessage: null,
      phase: state.phase === 'saving' ? 'saving' : resolveSessionPhase(state),
    };
  }

  if (event.type === 'SELECTION_CHANGED') {
    return {
      ...state,
      selectionText: event.text.trim(),
    };
  }

  if (event.type === 'FORMATTING_CHANGED') {
    return {
      ...state,
      formattingState: event.formattingState,
    };
  }

  if (event.type === 'IMAGE_UPLOADED') {
    return {
      ...state,
      mediaAssets: appendRuntimeMediaAsset(state.mediaAssets, event.asset),
      errorMessage: null,
    };
  }

  if (event.type === 'SAVE_REQUESTED') {
    return {
      ...state,
      saveRequestId: state.saveRequestId + 1,
    };
  }

  if (event.type === 'SAVE_STARTED') {
    return {
      ...state,
      phase: 'saving',
      syncStatus: 'syncing',
      errorMessage: null,
    };
  }

  if (event.type === 'LOCAL_SAVE_SUCCEEDED') {
    const normalizedSavedHtml = normalizeBodyHtml(event.savedHtml);
    const nextSnapshot = buildEditorDocumentSnapshot(normalizedSavedHtml);
    const nextDocument = event.document ?? state.source.document;
    const nextBaseline: EditorSessionBaseline | null = state.baseline
      ? {
          ...state.baseline,
          snapshot: nextSnapshot,
          baseline_body_html: normalizedSavedHtml,
          media_assets: nextDocument?.media_assets ?? state.mediaAssets,
          save_state: 'unsynced',
        }
      : null;
    return {
      ...state,
      baseline: nextBaseline,
      snapshot: nextSnapshot,
      mediaAssets: nextDocument
        ? mergeVisibleMediaAssets(nextDocument.media_assets, state.mediaAssets)
        : state.mediaAssets,
      syncStatus: 'unsynced',
      hasConfirmedLocalEdit: false,
      errorMessage: null,
      source: {
        ...state.source,
        local_draft_html: normalizedSavedHtml,
        document: nextDocument,
      },
      phase: resolveSessionPhase({
        ...state,
        baseline: nextBaseline,
        snapshot: nextSnapshot,
        errorMessage: null,
      }),
    };
  }

  // SAVE_FAILED
  return {
    ...state,
    syncStatus: 'unsynced',
    errorMessage: event.message,
    hasConfirmedLocalEdit: true,
    phase: 'error',
    baseline: state.baseline
      ? {
          ...state.baseline,
          baseline_body_html: normalizeBodyHtml(state.baseline.baseline_body_html),
        }
      : null,
    snapshot: buildEditorDocumentSnapshot(event.attemptedHtml),
  };
}

// ============================================================================
// 辅助函数导入（供 reducer 内部使用）
// ============================================================================

import { mergeVisibleMediaAssets } from './sessionHydration';
