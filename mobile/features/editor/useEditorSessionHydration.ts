import { useEffect } from 'react';

import type { EditorSourceDocument } from '@/features/editor/types';
import type { EditorSessionEvent } from '@/features/editor/sessionState';

/*统一处理正文会话的 reset、待同步正文加载、缓存加载和来源文档回灌。 */
export function useEditorSessionHydration<TDocument>(input: {
  documentId: string | null;
  document: TDocument | null;
  buildSourceDocument: (doc: TDocument) => EditorSourceDocument;
  loadPendingBody?: (id: string) => Promise<string | null>;
  loadBaseline?: (id: string) => Promise<string | null>;
  dispatch: React.Dispatch<EditorSessionEvent>;
  resetUiState: () => void;
}) {
  const {
    documentId,
    document,
    buildSourceDocument,
    loadPendingBody,
    loadBaseline,
    dispatch,
    resetUiState,
  } = input;

  useEffect(() => {
    dispatch({ type: 'RESET_SESSION', documentId });
    resetUiState();
  }, [dispatch, documentId, resetUiState]);

  useEffect(() => {
    if (!documentId || !loadPendingBody) {
      dispatch({ type: 'PENDING_BODY_HTML_LOADED', html: null });
      return;
    }

    let cancelled = false;
    void (async () => {
      const pendingBodyHtml = await loadPendingBody(documentId);
      if (cancelled) return;
      dispatch({ type: 'PENDING_BODY_HTML_LOADED', html: pendingBodyHtml });
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch, documentId, loadPendingBody]);

  useEffect(() => {
    if (!documentId || !loadBaseline) {
      dispatch({ type: 'BASELINE_CONTENT_LOADED', html: null });
      return;
    }

    let cancelled = false;
    void (async () => {
      const baselineHtml = await loadBaseline(documentId);
      if (cancelled) return;
      dispatch({ type: 'BASELINE_CONTENT_LOADED', html: baselineHtml });
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch, documentId, loadBaseline]);

  useEffect(() => {
    dispatch({
      type: 'SOURCE_DOCUMENT_LOADED',
      document: document ? buildSourceDocument(document) : null,
    });
  }, [buildSourceDocument, dispatch, document]);
}
