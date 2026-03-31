import { useEffect } from 'react';

import type { EditorSourceDocument } from '@/features/editor/types';
import type { EditorSessionEvent } from '@/features/editor/sessionState';

/*统一处理正文会话的 reset、本地草稿加载、缓存加载和来源文档回灌。 */
export function useEditorSessionHydration<TDocument>(input: {
  documentId: string | null;
  document: TDocument | null;
  buildSourceDocument: (doc: TDocument) => EditorSourceDocument;
  loadLocalDraft?: (id: string) => Promise<string | null>;
  loadCache?: (id: string) => Promise<string | null>;
  dispatch: React.Dispatch<EditorSessionEvent>;
  resetUiState: () => void;
}) {
  const {
    documentId,
    document,
    buildSourceDocument,
    loadLocalDraft,
    loadCache,
    dispatch,
    resetUiState,
  } = input;

  useEffect(() => {
    dispatch({ type: 'RESET_SESSION', documentId });
    resetUiState();
  }, [dispatch, documentId, resetUiState]);

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
  }, [dispatch, documentId, loadLocalDraft]);

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
  }, [dispatch, documentId, loadCache]);

  useEffect(() => {
    dispatch({
      type: 'SOURCE_DOCUMENT_LOADED',
      document: document ? buildSourceDocument(document) : null,
    });
  }, [buildSourceDocument, dispatch, document]);
}
