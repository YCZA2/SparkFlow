import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { uploadImageAsset } from '@/features/fragments/api';
import {
  loadRemoteBodyDraft,
  saveRemoteBodyDraft,
} from '@/features/fragments/store';
import {
  resolveLocalDraftPersistStatus,
  shouldTriggerRemoteSync,
} from '@/features/fragments/bodySyncPolicy';
import {
  appendImageToSnapshot,
  createInitialEditorSessionState,
  reduceEditorSession,
  shouldPublishOptimisticDocument,
} from '@/features/editor/sessionState';
import type {
  EditorDocumentSnapshot,
  EditorFormattingState,
  EditorMediaAsset,
  EditorSurfaceHandle,
} from '@/features/editor/types';
import {
  enqueueLocalFragmentSync,
  enqueueRemoteFragmentBodySync,
} from '@/features/fragments/localFragmentSyncQueue';
import {
  attachPendingLocalImage,
  loadLocalFragmentDraft,
  peekRemoteFragmentSnapshot,
  saveLocalFragmentDraft,
} from '@/features/fragments/store';
import { resolveLocalDraftSession } from '@/features/fragments/localDraftSession';
import {
  buildOptimisticFragmentSnapshot,
} from '@/features/fragments/detail/bodySessionState';
import type { Fragment, MediaAsset } from '@/types/fragment';

interface UseFragmentBodySessionOptions {
  fragmentId?: string | null;
  fragment: Fragment | null;
  commitOptimisticFragment: (fragment: Fragment) => Promise<void>;
}

function resolveCachedBodyHtml(
  fragmentId: string | null,
  fragment: Fragment | null
): string | null {
  /*按当前会话和已绑定远端 id 读取最近一次可用的正文缓存。 */
  if (!fragmentId || !fragment) return null;
  if (fragment.remote_id) {
    return peekRemoteFragmentSnapshot(fragment.remote_id)?.body_html ?? null;
  }
  return peekRemoteFragmentSnapshot(fragmentId)?.body_html ?? null;
}

function buildLocalMediaAssetFromPendingImage(input: {
  asset: DocumentPicker.DocumentPickerAsset;
  pendingAssetId: string;
  uploadStatus: string;
}): EditorMediaAsset {
  /*把本地待上传图片映射成编辑器运行时可见的媒体素材。 */
  return {
    id: input.pendingAssetId,
    media_kind: 'image',
    original_filename: input.asset.name ?? 'image.jpg',
    mime_type: input.asset.mimeType ?? 'image/jpeg',
    file_size: 0,
    checksum: null,
    width: null,
    height: null,
    duration_ms: null,
    status: input.uploadStatus,
    created_at: null,
    file_url: input.asset.uri,
    expires_at: null,
  };
}

export function useFragmentBodySession({
  fragmentId,
  fragment,
  commitOptimisticFragment,
}: UseFragmentBodySessionOptions) {
  /*用单一 reducer 编排正文会话，让 hydrate、保存和工具动作共享同一真值。 */
  const resolvedFragmentId = fragmentId ?? fragment?.id ?? null;
  const localDraftSession = useMemo(
    () => resolveLocalDraftSession({ routeFragmentId: fragmentId, fragment }),
    [fragment, fragmentId]
  );
  const [state, dispatch] = useReducer(
    reduceEditorSession,
    resolvedFragmentId,
    (initialId) => createInitialEditorSessionState(initialId, 'local-first')
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const editorRef = useRef<EditorSurfaceHandle | null>(null);
  const stateRef = useRef(state);
  const fragmentRef = useRef(fragment);
  const commitOptimisticFragmentRef = useRef(commitOptimisticFragment);
  const resolvedFragmentIdRef = useRef(resolvedFragmentId);
  const localDraftIdRef = useRef(localDraftSession.localDraftId);

  useEffect(() => {
    /*同步 ref，保证保存和工具动作总是读取最新上下文。 */
    stateRef.current = state;
    fragmentRef.current = fragment;
    commitOptimisticFragmentRef.current = commitOptimisticFragment;
    resolvedFragmentIdRef.current = resolvedFragmentId;
    localDraftIdRef.current = localDraftSession.localDraftId;
  }, [commitOptimisticFragment, fragment, localDraftSession.localDraftId, resolvedFragmentId, state]);

  useEffect(() => {
    /*切换 fragment 时重置整段编辑会话，但保持同页 UI 壳层不变。 */
    dispatch({
      type: 'RESET_SESSION',
      documentId: resolvedFragmentId,
      persistenceMode: 'local-first',
    });
  }, [resolvedFragmentId]);

  useEffect(() => {
    /*远端详情一旦刷新，就把 fragment 和缓存基线一起送入会话状态机。 */
    dispatch({ type: 'REMOTE_LOADED', document: fragment });
    dispatch({
      type: 'CACHE_LOADED',
      html: resolveCachedBodyHtml(resolvedFragmentId, fragment),
    });
  }, [fragment, resolvedFragmentId]);

  useEffect(() => {
    /*按当前详情维度读取本地正文草稿，让首屏 hydrate 有稳定优先级。 */
    if (!resolvedFragmentId) {
      dispatch({ type: 'LOCAL_DRAFT_LOADED', html: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextDraftHtml = localDraftSession.localDraftId
        ? (await loadLocalFragmentDraft(localDraftSession.localDraftId))?.body_html ?? null
        : await loadRemoteBodyDraft(resolvedFragmentId);
      if (cancelled) return;
      dispatch({ type: 'LOCAL_DRAFT_LOADED', html: nextDraftHtml });
    })();
    return () => {
      cancelled = true;
    };
  }, [localDraftSession.localDraftId, resolvedFragmentId]);

  useEffect(() => {
    /*本地输入应立即反映到详情资源与草稿存储，但不等待远端保存完成。 */
    const currentFragment = fragmentRef.current;
    const currentFragmentId = resolvedFragmentIdRef.current;
    const currentLocalDraftId = localDraftIdRef.current;
    if (!currentFragment || !currentFragmentId) return;
    if (!shouldPublishOptimisticDocument(state)) return;

    const optimisticFragment = buildOptimisticFragmentSnapshot(
      currentFragment,
      state.snapshot,
      state.mediaAssets
    );

    if (currentLocalDraftId) {
      void Promise.all([
        saveLocalFragmentDraft(currentLocalDraftId, {
          body_html: state.snapshot.body_html,
          plain_text_snapshot: state.snapshot.plain_text,
          sync_status: resolveLocalDraftPersistStatus({
            fragment: currentFragment,
            queueRemote: false,
          }),
          next_retry_at: null,
        }),
        commitOptimisticFragmentRef.current(optimisticFragment),
      ]).catch(() => undefined);
      return;
    }

    void Promise.all([
      saveRemoteBodyDraft(currentFragmentId, state.snapshot.body_html),
      commitOptimisticFragmentRef.current(optimisticFragment),
    ]).catch(() => undefined);
  }, [state]);

  const getLiveSnapshot = useCallback((): EditorDocumentSnapshot => {
    /*保存与分享优先读取 bridge 当前快照，避免丢掉去抖窗口内输入。 */
    const snapshot = editorRef.current?.getSnapshot?.();
    return snapshot ?? stateRef.current.snapshot;
  }, []);

  const persistSnapshotLocally = useCallback(
    async (
      snapshot: EditorDocumentSnapshot,
      options?: { enqueueRemote?: boolean; forceRemote?: boolean }
    ): Promise<void> => {
      /*把最新快照先稳稳落到本地，再按触发点决定是否进入远端同步队列。 */
      const currentFragment = fragmentRef.current;
      const currentFragmentId = resolvedFragmentIdRef.current;
      const currentLocalDraftId = localDraftIdRef.current;
      if (!currentFragment || !currentFragmentId) return;

      const shouldEnqueueRemote = Boolean(
        options?.enqueueRemote &&
          shouldTriggerRemoteSync({
            fragment: currentFragment,
            snapshot,
            mediaAssets: stateRef.current.mediaAssets,
            baselineRemoteHtml: stateRef.current.baseline?.remote_baseline ?? null,
            baselineMediaAssets: stateRef.current.baseline?.media_assets ?? [],
          })
      );

      if (currentLocalDraftId) {
        await saveLocalFragmentDraft(currentLocalDraftId, {
          body_html: snapshot.body_html,
          plain_text_snapshot: snapshot.plain_text,
          sync_status: resolveLocalDraftPersistStatus({
            fragment: currentFragment,
            queueRemote: shouldEnqueueRemote,
          }),
          next_retry_at: null,
        });
        await commitOptimisticFragmentRef.current({
          ...currentFragment,
          body_html: snapshot.body_html,
          plain_text_snapshot: snapshot.plain_text,
          media_assets: stateRef.current.mediaAssets,
          local_sync_status: resolveLocalDraftPersistStatus({
            fragment: currentFragment,
            queueRemote: shouldEnqueueRemote,
          }),
        });
        if (shouldEnqueueRemote) {
          void enqueueLocalFragmentSync(currentLocalDraftId, {
            force: options?.forceRemote ?? true,
          }).catch(() => undefined);
        }
        return;
      }

      await saveRemoteBodyDraft(currentFragmentId, snapshot.body_html);
      await commitOptimisticFragmentRef.current({
        ...currentFragment,
        body_html: snapshot.body_html,
        plain_text_snapshot: snapshot.plain_text,
        media_assets: stateRef.current.mediaAssets,
      });
      if (shouldEnqueueRemote) {
        void enqueueRemoteFragmentBodySync(currentFragmentId, {
          force: options?.forceRemote ?? true,
        }).catch(() => undefined);
      }
    },
    []
  );

  const onSnapshotChange = useCallback((snapshot: EditorDocumentSnapshot) => {
    /*bridge 输出的标准化快照直接进入会话状态机。 */
    dispatch({ type: 'SNAPSHOT_CHANGED', snapshot });
  }, []);

  const onSelectionChange = useCallback((text: string) => {
    /*只同步当前选区纯文本，保持会话层选区状态与编辑器一致。 */
    dispatch({ type: 'SELECTION_CHANGED', text });
  }, []);

  const onFormattingStateChange = useCallback((formattingState: EditorFormattingState) => {
    /*把 DOM 工具栏态收敛进 session，页面层只消费当前 view-model。 */
    dispatch({ type: 'FORMATTING_CHANGED', formattingState });
  }, []);

  const onEditorReady = useCallback(() => {
    /*bridge 就绪后再把会话切到可交互状态。 */
    dispatch({ type: 'EDITOR_READY' });
  }, []);

  const onInsertImage = useCallback(async () => {
    /*图片插入先回流本地会话，远端收敛延后到离页、失焦或后台触发。 */
    try {
      setIsUploadingImage(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const currentFragment = fragmentRef.current;
      const currentFragmentId = resolvedFragmentIdRef.current;
      const currentLocalDraftId = localDraftIdRef.current;
      if (!asset?.uri || !currentFragment || !currentFragmentId) return;

      if (currentLocalDraftId) {
        const pendingAsset = await attachPendingLocalImage(currentLocalDraftId, {
          local_uri: asset.uri,
          file_name: asset.name ?? 'image.jpg',
          mime_type: asset.mimeType ?? 'image/jpeg',
        });
        if (!pendingAsset) return;
        const localMediaAsset = buildLocalMediaAssetFromPendingImage({
          asset,
          pendingAssetId: pendingAsset.local_asset_id,
          uploadStatus: pendingAsset.upload_status,
        });
        dispatch({ type: 'IMAGE_UPLOADED', asset: localMediaAsset });
        if (stateRef.current.isEditorReady) {
          editorRef.current?.insertImage(localMediaAsset);
        } else {
          dispatch({
            type: 'SNAPSHOT_CHANGED',
            snapshot: appendImageToSnapshot(getLiveSnapshot(), localMediaAsset),
          });
        }
        return;
      }

      const uploaded = await uploadImageAsset(
        asset.uri,
        asset.name ?? 'image.jpg',
        asset.mimeType ?? 'image/jpeg'
      );
      dispatch({ type: 'IMAGE_UPLOADED', asset: uploaded });
      if (stateRef.current.isEditorReady) {
        editorRef.current?.insertImage(uploaded);
      } else {
        dispatch({
          type: 'SNAPSHOT_CHANGED',
          snapshot: appendImageToSnapshot(getLiveSnapshot(), uploaded),
        });
      }
    } finally {
      setIsUploadingImage(false);
    }
  }, [getLiveSnapshot]);

  const saveNow = useCallback(async () => {
    /*离页前先落本地，再把需要上云的内容交给后台同步队列。 */
    const latestSnapshot = getLiveSnapshot();
    await persistSnapshotLocally(latestSnapshot, {
      enqueueRemote: true,
      forceRemote: true,
    });
  }, [getLiveSnapshot, persistSnapshotLocally]);

  const onEditorBlur = useCallback(() => {
    /*编辑器失焦时做一次本地 flush，并把远端同步交给后台静默收敛。 */
    void saveNow().catch(() => undefined);
  }, [saveNow]);

  useEffect(() => {
    /*应用退到后台前先 flush 当前编辑器，避免最后几次输入停留在 bridge 内存里。 */
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void saveNow().catch(() => undefined);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [saveNow]);

  useEffect(() => {
    /*详情页卸载前补一次非阻塞 flush，保证返回列表时本地和后台同步都已接力。 */
    return () => {
      void saveNow().catch(() => undefined);
    };
  }, [saveNow]);

  const statusLabel = useMemo(() => {
    /*详情页默认保持安静，只在明确失败时提示“已保存在本地”。 */
    if (!state.isDraftHydrated || !state.isEditorReady) return null;
    if (fragment?.is_local_draft && fragment.local_sync_status === 'failed_pending_retry') {
      return '已保存在本地，稍后同步';
    }
    if (state.errorMessage || state.syncStatus === 'unsynced') {
      return '已保存在本地，稍后同步';
    }
    return null;
  }, [
    fragment?.is_local_draft,
    fragment?.local_sync_status,
    state.errorMessage,
    state.isDraftHydrated,
    state.isEditorReady,
    state.syncStatus,
  ]);

  return {
    editorRef,
    editorKey: state.editorKey,
    initialBodyHtml: state.snapshot.body_html,
    shouldAutoFocus: Boolean(localDraftSession.isLocalDraftSession && !state.snapshot.body_html.trim()),
    mediaAssets: state.mediaAssets,
    formattingState: state.formattingState,
    isDraftHydrated: state.isDraftHydrated,
    statusLabel,
    isUploadingImage,
    saveNow,
    onEditorBlur,
    onEditorReady,
    onSnapshotChange,
    onSelectionChange,
    onFormattingStateChange,
    onInsertImage,
  };
}
