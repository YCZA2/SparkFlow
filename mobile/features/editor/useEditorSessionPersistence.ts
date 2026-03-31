import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import { normalizeBodyHtml } from '@/features/editor/html';
import { resolveEditorSnapshotForSave } from '@/features/editor/saveSnapshot';
import {
  shouldPublishOptimisticDocument,
  type EditorSessionEvent,
  type EditorSessionState,
} from '@/features/editor/sessionState';
import type { EditorDocumentSnapshot, EditorSourceDocument } from '@/features/editor/types';
import type { EditorSessionConfig } from '@/features/editor/useEditorSession.types';
import type { EditorSessionRuntimeRefs } from '@/features/editor/editorSessionRuntime';

/*统一处理乐观提交、显式保存和生命周期保存，避免主 hook 堆叠副作用。 */
export function useEditorSessionPersistence<TDocument>(input: {
  state: EditorSessionState;
  dispatch: React.Dispatch<EditorSessionEvent>;
  refs: EditorSessionRuntimeRefs<TDocument>;
  buildSourceDocument: (doc: TDocument) => EditorSourceDocument;
  saveLocally?: EditorSessionConfig<TDocument>['saveLocally'];
  shouldSaveOnBackground: boolean;
}) {
  const { state, dispatch, refs, buildSourceDocument, saveLocally, shouldSaveOnBackground } = input;

  const getLiveSnapshot = useCallback((): EditorDocumentSnapshot => {
    const snapshot = refs.editorRef.current?.getSnapshot?.();
    return snapshot ?? refs.stateRef.current.snapshot;
  }, [refs.editorRef, refs.stateRef]);

  const saveNow = useCallback(
    async (options?: { force?: boolean }) => {
      const currentDocument = refs.documentRef.current;
      const currentDocumentId = refs.documentIdRef.current;
      if (!currentDocument || !currentDocumentId) return;

      /*显式保存时优先读取桥接快照，兜住输入事件尚未回灌 reducer 的窗口。 */
      const latestSnapshot = await resolveEditorSnapshotForSave({
        editor: refs.editorRef.current,
        fallbackSnapshot: getLiveSnapshot(),
      });
      const baselineBodyHtml = normalizeBodyHtml(
        refs.stateRef.current.baseline?.baseline_body_html ?? buildSourceDocument(currentDocument).body_html
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
    [
      buildSourceDocument,
      dispatch,
      getLiveSnapshot,
      refs.documentIdRef,
      refs.documentRef,
      refs.editorRef,
      refs.stateRef,
      saveLocally,
    ]
  );

  useEffect(() => {
    const currentDocument = refs.documentRef.current;
    if (!currentDocument || !shouldPublishOptimisticDocument(state)) return;

    if (refs.commitOptimisticRef.current) {
      void refs.commitOptimisticRef.current(currentDocument).catch(() => undefined);
    }
  }, [refs.commitOptimisticRef, refs.documentRef, state]);

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

  useEffect(() => {
    return () => {
      void saveNow().catch(() => undefined);
    };
  }, [saveNow]);

  return {
    getLiveSnapshot,
    saveNow,
  };
}
