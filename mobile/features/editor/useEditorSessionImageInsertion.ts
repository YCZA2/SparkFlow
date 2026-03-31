import { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { appendImageToSnapshot, type EditorSessionEvent } from '@/features/editor/sessionState';
import type { EditorDocumentSnapshot, EditorMediaAsset } from '@/features/editor/types';
import type { EditorSessionConfig } from '@/features/editor/useEditorSession.types';
import {
  buildLocalMediaAssetFromPendingImage,
  type EditorSessionRuntimeRefs,
} from '@/features/editor/editorSessionRuntime';

/*统一图片插入流程，兼容本地 pending asset 和直接上传两条路径。 */
export function useEditorSessionImageInsertion<TDocument>(input: {
  supportsImages: boolean;
  uploadImageAsset?: EditorSessionConfig<TDocument>['uploadImageAsset'];
  attachPendingLocalImage?: EditorSessionConfig<TDocument>['attachPendingLocalImage'];
  refs: EditorSessionRuntimeRefs<TDocument>;
  dispatch: React.Dispatch<EditorSessionEvent>;
  getLiveSnapshot: () => EditorDocumentSnapshot;
}) {
  const {
    supportsImages,
    uploadImageAsset,
    attachPendingLocalImage,
    refs,
    dispatch,
    getLiveSnapshot,
  } = input;
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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
      const currentDocumentId = refs.documentIdRef.current;
      if (!asset?.uri || !currentDocumentId) return;

      let mediaAsset: EditorMediaAsset;

      if (attachPendingLocalImage) {
        const pendingAsset = await attachPendingLocalImage(currentDocumentId, {
          local_uri: asset.uri,
          file_name: asset.name ?? 'image.jpg',
          mime_type: asset.mimeType ?? 'image/jpeg',
        });

        if (!pendingAsset) return;

        mediaAsset = buildLocalMediaAssetFromPendingImage({
          asset,
          pendingAsset,
        });
      } else if (uploadImageAsset) {
        mediaAsset = await uploadImageAsset(
          asset.uri,
          asset.name ?? 'image.jpg',
          asset.mimeType ?? 'image/jpeg'
        );
      } else {
        return;
      }

      dispatch({ type: 'IMAGE_UPLOADED', asset: mediaAsset });

      if (refs.stateRef.current.isEditorReady) {
        refs.editorRef.current?.insertImage(mediaAsset);
      } else {
        dispatch({
          type: 'SNAPSHOT_CHANGED',
          snapshot: appendImageToSnapshot(getLiveSnapshot(), mediaAsset),
        });
      }
    } finally {
      setIsUploadingImage(false);
    }
  }, [attachPendingLocalImage, dispatch, getLiveSnapshot, refs.documentIdRef, refs.editorRef, refs.stateRef, supportsImages, uploadImageAsset]);

  return {
    isUploadingImage,
    onInsertImage: supportsImages ? onInsertImage : undefined,
  };
}
