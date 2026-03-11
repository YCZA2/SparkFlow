import { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { requestAiEdit, uploadImageAsset } from '@/features/fragments/api';
import type {
  FragmentAiPatch,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';
import type { FragmentRichEditorHandle } from '@/features/fragments/components/FragmentRichEditor';

import {
  appendRuntimeMediaAsset,
  applyAiPatchFallbackToSnapshot,
} from './bodySessionState';

type FragmentAiInstruction =
  | 'polish'
  | 'shorten'
  | 'expand'
  | 'title'
  | 'script_seed';

interface UseFragmentEditorActionsOptions {
  fragmentId?: string | null;
  editorRef: React.RefObject<FragmentRichEditorHandle | null>;
  isEditorReady: boolean;
  selectionText: string;
  getSnapshot: () => FragmentEditorSnapshot;
  onSnapshotFallback: (snapshot: FragmentEditorSnapshot) => void;
  appendMediaAsset: (recipe: (current: MediaAsset[]) => MediaAsset[]) => void;
}

export function useFragmentEditorActions({
  fragmentId,
  editorRef,
  isEditorReady,
  selectionText,
  getSnapshot,
  onSnapshotFallback,
  appendMediaAsset,
}: UseFragmentEditorActionsOptions) {
  /** 中文注释：收拢图片上传与 AI patch，避免保存链路混入动作细节。 */
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);

  const onInsertImage = useCallback(async () => {
    try {
      setIsUploadingImage(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      const uploaded = await uploadImageAsset(
        asset.uri,
        asset.name ?? 'image.jpg',
        asset.mimeType ?? 'image/jpeg'
      );
      appendMediaAsset((current) => appendRuntimeMediaAsset(current, uploaded));
      const insertImage = editorRef.current?.insertImage;
      if (typeof insertImage === 'function') {
        insertImage(uploaded);
      }
    } finally {
      setIsUploadingImage(false);
    }
  }, [appendMediaAsset, editorRef]);

  const applyPatch = useCallback(
    (patch: FragmentAiPatch) => {
      /** 中文注释：bridge 可用时优先改 DOM，不可用时回退到本地快照。 */
      if (isEditorReady) {
        const applyPatch = editorRef.current?.applyPatch;
        if (typeof applyPatch === 'function') {
          applyPatch(patch);
          return;
        }
      }
      onSnapshotFallback(
        applyAiPatchFallbackToSnapshot(getSnapshot(), patch, selectionText)
      );
    },
    [editorRef, getSnapshot, isEditorReady, onSnapshotFallback, selectionText]
  );

  const onAiAction = useCallback(
    async (instruction: FragmentAiInstruction) => {
      if (!fragmentId) return;
      try {
        setIsAiRunning(true);
        const latestSnapshot = getSnapshot();
        const response = await requestAiEdit(fragmentId, {
          body_markdown: latestSnapshot.body_markdown,
          instruction,
          selection_text: selectionText || undefined,
        });
        applyPatch(response.patch);
      } finally {
        setIsAiRunning(false);
      }
    },
    [applyPatch, fragmentId, getSnapshot, selectionText]
  );

  return {
    isUploadingImage,
    isAiRunning,
    onInsertImage,
    onAiAction,
  };
}
