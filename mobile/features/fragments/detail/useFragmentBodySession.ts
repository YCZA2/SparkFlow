import { useCallback, useState } from 'react';

import type {
  Fragment,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
} from '@/types/fragment';

import { useFragmentEditorActions } from './useFragmentEditorActions';
import { useFragmentEditorPersistence } from './useFragmentEditorPersistence';

interface UseFragmentBodySessionOptions {
  fragmentId?: string | null;
  fragment: Fragment | null;
  commitRemoteFragment: (fragment: Fragment) => Promise<void>;
  commitOptimisticFragment: (fragment: Fragment) => Promise<void>;
}

export function useFragmentBodySession({
  fragmentId,
  fragment,
  commitRemoteFragment,
  commitOptimisticFragment,
}: UseFragmentBodySessionOptions) {
  /*编排详情正文编辑会话，把持久化层与编辑动作层组装成统一接口。 */
  const [selectionText, setSelectionText] = useState('');
  const [formattingState, setFormattingState] =
    useState<FragmentEditorFormattingState | null>(null);
  const persistence = useFragmentEditorPersistence({
    fragmentId,
    fragment,
    commitRemoteFragment,
    commitOptimisticFragment,
  });

  const handleSnapshotFallback = useCallback(
    (nextSnapshot: FragmentEditorSnapshot) => {
      persistence.onSnapshotChange(nextSnapshot);
    },
    [persistence]
  );

  const actions = useFragmentEditorActions({
    fragment,
    editorRef: persistence.editorRef,
    isEditorReady: persistence.isEditorReady,
    selectionText,
    getSnapshot: persistence.getLiveSnapshot,
    onSnapshotFallback: handleSnapshotFallback,
    appendMediaAsset: persistence.setRuntimeMediaAssets,
  });

  const handleSelectionChange = useCallback((text: string) => {
    /*同步当前选中文本，供 AI patch 优先围绕局部内容生成。 */
    setSelectionText(text.trim());
  }, []);

  const handleFormattingStateChange = useCallback(
    (nextState: FragmentEditorFormattingState) => {
      /*同步工具栏格式态，避免页面层直接理解 DOM 编辑器。 */
      setFormattingState(nextState);
    },
    []
  );

  return {
    editorRef: persistence.editorRef,
    editorKey: persistence.editorKey,
    initialBodyMarkdown: persistence.snapshot.body_markdown,
    shouldAutoFocus: Boolean(fragment?.is_local_draft && !persistence.snapshot.body_markdown.trim()),
    mediaAssets: persistence.mediaAssets,
    formattingState,
    isDraftHydrated: persistence.isDraftHydrated,
    statusLabel:
      persistence.isDraftHydrated && persistence.isEditorReady
        ? persistence.statusLabel
        : null,
    isUploadingImage: actions.isUploadingImage,
    isAiRunning: actions.isAiRunning,
    saveNow: persistence.saveNow,
    onEditorReady: persistence.onEditorReady,
    onSnapshotChange: persistence.onSnapshotChange,
    onSelectionChange: handleSelectionChange,
    onFormattingStateChange: handleFormattingStateChange,
    onInsertImage: actions.onInsertImage,
    onAiAction: actions.onAiAction,
  };
}
