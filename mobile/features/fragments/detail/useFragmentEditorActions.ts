import { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { requestAiEdit, uploadImageAsset } from '@/features/fragments/api';
import { enqueueLocalFragmentSync } from '@/features/fragments/localFragmentSyncQueue';
import { attachPendingLocalImage } from '@/features/fragments/localDrafts';
import type {
  Fragment,
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
  fragment: Fragment | null;
  editorRef: React.RefObject<FragmentRichEditorHandle | null>;
  isEditorReady: boolean;
  selectionText: string;
  getSnapshot: () => FragmentEditorSnapshot;
  onSnapshotFallback: (snapshot: FragmentEditorSnapshot) => void;
  appendMediaAsset: (recipe: (current: MediaAsset[]) => MediaAsset[]) => void;
}

export function useFragmentEditorActions({
  fragment,
  editorRef,
  isEditorReady,
  selectionText,
  getSnapshot,
  onSnapshotFallback,
  appendMediaAsset,
}: UseFragmentEditorActionsOptions) {
  /*收拢图片上传与 AI patch，避免保存链路混入动作细节。 */
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const remoteFragmentId = fragment?.remote_id ?? (fragment?.is_local_draft ? null : fragment?.id ?? null);

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
      if (fragment?.is_local_draft && fragment.local_id) {
        const pendingAsset = await attachPendingLocalImage(fragment.local_id, {
          local_uri: asset.uri,
          file_name: asset.name ?? 'image.jpg',
          mime_type: asset.mimeType ?? 'image/jpeg',
        });
        if (!pendingAsset) return;
        const localMediaAsset: MediaAsset = {
          id: pendingAsset.local_asset_id,
          media_kind: 'image',
          original_filename: pendingAsset.file_name,
          mime_type: pendingAsset.mime_type,
          file_size: 0,
          checksum: null,
          width: null,
          height: null,
          duration_ms: null,
          status: pendingAsset.upload_status,
          created_at: null,
          file_url: pendingAsset.local_uri,
          expires_at: null,
        };
        appendMediaAsset((current) => appendRuntimeMediaAsset(current, localMediaAsset));
        const insertImage = editorRef.current?.insertImage;
        if (typeof insertImage === 'function') {
          insertImage(localMediaAsset);
        }
        void enqueueLocalFragmentSync(fragment.local_id, { delayMs: 800 }).catch(() => undefined);
        return;
      }
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
  }, [appendMediaAsset, editorRef, fragment]);

  const applyPatch = useCallback(
    (patch: FragmentAiPatch) => {
      /*bridge 可用时优先改 DOM，不可用时回退到本地快照。 */
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
      if (!remoteFragmentId) return;
      try {
        setIsAiRunning(true);
        const latestSnapshot = getSnapshot();
        const response = await requestAiEdit(remoteFragmentId, {
          body_markdown: latestSnapshot.body_markdown,
          instruction,
          selection_text: selectionText || undefined,
        });
        applyPatch(response.patch);
      } finally {
        setIsAiRunning(false);
      }
    },
    [applyPatch, getSnapshot, remoteFragmentId, selectionText]
  );

  return {
    isUploadingImage,
    isAiRunning,
    onInsertImage,
    onAiAction,
  };
}
