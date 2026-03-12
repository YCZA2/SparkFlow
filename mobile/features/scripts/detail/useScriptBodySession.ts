import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AppState } from 'react-native';

import {
  createInitialEditorSessionState,
  reduceEditorSession,
  shouldPublishOptimisticDocument,
} from '@/features/editor/sessionState';
import type {
  EditorDocumentSnapshot,
  EditorFormattingState,
  EditorSourceDocument,
  EditorSurfaceHandle,
} from '@/features/editor/types';
import { normalizeBodyHtml } from '@/features/editor/html';
import { updateScript } from '@/features/scripts/api';
import type { Script } from '@/types/script';

interface UseScriptBodySessionOptions {
  scriptId?: string | null;
  script: Script | null;
  commitOptimisticScript: (script: Script) => Promise<void>;
  commitRemoteScript: (script: Script) => Promise<void>;
}

function buildEditorDocumentFromScript(script: Script): EditorSourceDocument {
  /*把脚本详情映射成共享编辑器可消费的最小文档协议。 */
  return {
    id: script.id,
    body_html: script.body_html ?? '',
    media_assets: [],
    is_local_draft: false,
    local_sync_status: null,
  };
}

export function useScriptBodySession({
  scriptId,
  script,
  commitOptimisticScript,
  commitRemoteScript,
}: UseScriptBodySessionOptions) {
  /*脚本详情复用共享 reducer，但保存策略固定为 remote-only。 */
  const resolvedScriptId = scriptId ?? script?.id ?? null;
  const [state, dispatch] = useReducer(
    reduceEditorSession,
    resolvedScriptId,
    (initialId) => createInitialEditorSessionState(initialId, 'remote-only')
  );
  const editorRef = useRef<EditorSurfaceHandle | null>(null);
  const stateRef = useRef(state);
  const scriptRef = useRef(script);
  const commitOptimisticScriptRef = useRef(commitOptimisticScript);
  const commitRemoteScriptRef = useRef(commitRemoteScript);

  useEffect(() => {
    /*同步 ref，保证保存时读取到当前脚本和最新会话态。 */
    stateRef.current = state;
    scriptRef.current = script;
    commitOptimisticScriptRef.current = commitOptimisticScript;
    commitRemoteScriptRef.current = commitRemoteScript;
  }, [commitOptimisticScript, commitRemoteScript, script, state]);

  useEffect(() => {
    /*切换脚本详情时重置编辑会话，但保留共享页面壳层。 */
    dispatch({
      type: 'RESET_SESSION',
      documentId: resolvedScriptId,
      persistenceMode: 'remote-only',
    });
    dispatch({ type: 'LOCAL_DRAFT_LOADED', html: null });
    dispatch({ type: 'CACHE_LOADED', html: null });
  }, [resolvedScriptId]);

  useEffect(() => {
    /*远端脚本刷新后，把当前正文送入共享会话基线。 */
    dispatch({
      type: 'REMOTE_LOADED',
      document: script ? buildEditorDocumentFromScript(script) : null,
    });
  }, [script]);

  useEffect(() => {
    /*本地输入应即时回写当前可见稿件，保证分享和拍摄拿到最新正文。 */
    const currentScript = scriptRef.current;
    if (!currentScript) return;
    if (!shouldPublishOptimisticDocument(state)) return;

    void commitOptimisticScriptRef.current({
      ...currentScript,
      body_html: state.snapshot.body_html,
    }).catch(() => undefined);
  }, [state]);

  const getLiveSnapshot = useCallback((): EditorDocumentSnapshot => {
    /*保存与拍摄优先读取 bridge 当前快照，避免去抖窗口内输入丢失。 */
    const snapshot = editorRef.current?.getSnapshot?.();
    return snapshot ?? stateRef.current.snapshot;
  }, []);

  const saveNow = useCallback(
    async (options?: { force?: boolean }) => {
      /*只有正文偏离远端基线时才 PATCH 脚本，减少无意义请求。 */
      const currentScript = scriptRef.current;
      if (!currentScript?.id) return;

      const latestSnapshot = getLiveSnapshot();
      const remoteBaseline = normalizeBodyHtml(stateRef.current.baseline?.remote_baseline ?? currentScript.body_html);
      if (!options?.force && normalizeBodyHtml(latestSnapshot.body_html) === remoteBaseline) {
        return;
      }

      dispatch({ type: 'SAVE_STARTED' });
      try {
        const updatedScript = await updateScript(currentScript.id, {
          body_html: latestSnapshot.body_html,
        });
        await commitRemoteScriptRef.current(updatedScript);
        dispatch({
          type: 'SAVE_SUCCEEDED',
          document: buildEditorDocumentFromScript(updatedScript),
          savedHtml: updatedScript.body_html ?? '',
        });
      } catch (error) {
        dispatch({
          type: 'SAVE_FAILED',
          attemptedHtml: latestSnapshot.body_html,
          message: error instanceof Error ? error.message : '保存失败',
        });
        throw error;
      }
    },
    [getLiveSnapshot]
  );

  const onSnapshotChange = useCallback((snapshot: EditorDocumentSnapshot) => {
    /*把编辑器标准化快照收进共享会话。 */
    dispatch({ type: 'SNAPSHOT_CHANGED', snapshot });
  }, []);

  const onSelectionChange = useCallback((text: string) => {
    /*同步当前选区纯文本，保持共享编辑状态一致。 */
    dispatch({ type: 'SELECTION_CHANGED', text });
  }, []);

  const onFormattingStateChange = useCallback((formattingState: EditorFormattingState) => {
    /*共享工具条所需格式态统一在会话层维护。 */
    dispatch({ type: 'FORMATTING_CHANGED', formattingState });
  }, []);

  const onEditorReady = useCallback(() => {
    /*bridge 就绪后再把脚本会话切到可交互状态。 */
    dispatch({ type: 'EDITOR_READY' });
  }, []);

  const onEditorBlur = useCallback(() => {
    /*脚本编辑失焦时尝试静默保存，失败提示留给显式退出。 */
    void saveNow().catch(() => undefined);
  }, [saveNow]);

  useEffect(() => {
    /*应用退到后台前补一次远端保存，减少正文编辑丢失窗口。 */
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void saveNow().catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [saveNow]);

  const statusLabel = useMemo(() => {
    /*脚本详情只在明确失败时提示用户重试，避免正常编辑过于吵闹。 */
    if (!state.isDraftHydrated || !state.isEditorReady) return null;
    if (state.errorMessage || state.syncStatus === 'unsynced') {
      return '未保存，请重试';
    }
    return null;
  }, [state.errorMessage, state.isDraftHydrated, state.isEditorReady, state.syncStatus]);

  return {
    editorRef,
    editorKey: state.editorKey,
    initialBodyHtml: state.snapshot.body_html,
    shouldAutoFocus: false,
    mediaAssets: state.mediaAssets,
    formattingState: state.formattingState,
    isDraftHydrated: state.isDraftHydrated,
    statusLabel,
    saveNow,
    onEditorBlur,
    onEditorReady,
    onSnapshotChange,
    onSelectionChange,
    onFormattingStateChange,
  };
}
