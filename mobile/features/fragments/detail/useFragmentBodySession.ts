import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';

import { uploadImageAsset } from '@/features/fragments/api';
import {
  loadFragmentBodyDraft,
  saveFragmentBodyDraft,
} from '@/features/fragments/bodyDrafts';
import { normalizeBodyHtml } from '@/features/fragments/bodyMarkdown';
import {
  appendImageToSnapshot,
  createInitialEditorSessionState,
  reduceEditorSession,
  shouldPublishOptimisticFragment,
  shouldQueueAutosave,
} from '@/features/fragments/detail/editorSessionState';
import { createLatestOnlySaveController } from '@/features/fragments/detail/fragmentSaveController';
import {
  enqueueLocalFragmentSync,
  enqueueRemoteFragmentBodySync,
} from '@/features/fragments/localFragmentSyncQueue';
import {
  attachPendingLocalImage,
  saveLocalFragmentDraft,
} from '@/features/fragments/localDrafts';
import { peekFragmentCache } from '@/features/fragments/fragmentRepository';
import {
  buildOptimisticFragmentSnapshot,
} from '@/features/fragments/detail/bodySessionState';
import type {
  Fragment,
  FragmentEditorFormattingState,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';
import type { FragmentRichEditorHandle } from '@/features/fragments/components/FragmentRichEditor';

const AUTOSAVE_DELAY_MS = 800;

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
    return peekFragmentCache(fragment.remote_id)?.fragment.body_html ?? null;
  }
  return peekFragmentCache(fragmentId)?.fragment.body_html ?? null;
}

function buildLocalMediaAssetFromPendingImage(input: {
  asset: DocumentPicker.DocumentPickerAsset;
  pendingAssetId: string;
  uploadStatus: string;
}): MediaAsset {
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
  const [state, dispatch] = useReducer(
    reduceEditorSession,
    resolvedFragmentId,
    createInitialEditorSessionState
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const editorRef = useRef<FragmentRichEditorHandle | null>(null);
  const stateRef = useRef(state);
  const fragmentRef = useRef(fragment);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitOptimisticFragmentRef = useRef(commitOptimisticFragment);
  const resolvedFragmentIdRef = useRef(resolvedFragmentId);

  useEffect(() => {
    /*同步 ref，保证保存和工具动作总是读取最新上下文。 */
    stateRef.current = state;
    fragmentRef.current = fragment;
    commitOptimisticFragmentRef.current = commitOptimisticFragment;
    resolvedFragmentIdRef.current = resolvedFragmentId;
  }, [commitOptimisticFragment, fragment, resolvedFragmentId, state]);

  useEffect(() => {
    /*切换 fragment 时重置整段编辑会话，但保持同页 UI 壳层不变。 */
    dispatch({ type: 'RESET_SESSION', fragmentId: resolvedFragmentId });
  }, [resolvedFragmentId]);

  useEffect(() => {
    /*远端详情一旦刷新，就把 fragment 和缓存基线一起送入会话状态机。 */
    dispatch({ type: 'REMOTE_LOADED', fragment });
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
      const nextDraftHtml = fragment?.is_local_draft
        ? fragment.body_html
        : await loadFragmentBodyDraft(resolvedFragmentId);
      if (cancelled) return;
      dispatch({ type: 'LOCAL_DRAFT_LOADED', html: nextDraftHtml });
    })();
    return () => {
      cancelled = true;
    };
  }, [fragment?.body_html, fragment?.is_local_draft, resolvedFragmentId]);

  useEffect(() => {
    /*本地输入应立即反映到详情资源与草稿存储，但不等待远端保存完成。 */
    const currentFragment = fragmentRef.current;
    const currentFragmentId = resolvedFragmentIdRef.current;
    if (!currentFragment || !currentFragmentId) return;
    if (!shouldPublishOptimisticFragment(state)) return;

    const optimisticFragment = buildOptimisticFragmentSnapshot(
      currentFragment,
      state.snapshot,
      state.mediaAssets
    );

    if (currentFragment.is_local_draft) {
      void Promise.all([
        saveLocalFragmentDraft(currentFragmentId, {
          body_html: state.snapshot.body_html,
          plain_text_snapshot: state.snapshot.plain_text,
          sync_status: currentFragment.remote_id ? 'syncing' : 'creating',
          next_retry_at: null,
        }),
        commitOptimisticFragmentRef.current(optimisticFragment),
      ]).catch(() => undefined);
      return;
    }

    void Promise.all([
      saveFragmentBodyDraft(currentFragmentId, state.snapshot.body_html),
      commitOptimisticFragmentRef.current(optimisticFragment),
    ]).catch(() => undefined);
  }, [state]);

  const getLiveSnapshot = useCallback((): FragmentEditorSnapshot => {
    /*保存与分享优先读取 bridge 当前快照，避免丢掉去抖窗口内输入。 */
    const snapshot = editorRef.current?.getSnapshot?.();
    return snapshot ?? stateRef.current.snapshot;
  }, []);

  const saveControllerRef = useRef(
    createLatestOnlySaveController<FragmentEditorSnapshot>({
      shouldProcess: (snapshot) => {
        /*只有正文真正偏离当前基线时才落保存任务。 */
        const remoteBaseline = stateRef.current.baseline?.remote_baseline ?? '';
        return normalizeBodyHtml(snapshot.body_html) !== normalizeBodyHtml(remoteBaseline);
      },
      submit: async (snapshot) => {
        /*把保存流程串行化，并在成功后统一回流 session 与资源层。 */
        const currentFragment = fragmentRef.current;
        const currentFragmentId = resolvedFragmentIdRef.current;
        if (!currentFragment || !currentFragmentId) return;

        dispatch({ type: 'SAVE_STARTED' });

        try {
          if (currentFragment.is_local_draft) {
            await saveLocalFragmentDraft(currentFragmentId, {
              body_html: snapshot.body_html,
              plain_text_snapshot: snapshot.plain_text,
              sync_status: currentFragment.remote_id ? 'syncing' : 'creating',
              next_retry_at: null,
            });
            void enqueueLocalFragmentSync(currentFragmentId, { delayMs: AUTOSAVE_DELAY_MS }).catch(
              () => undefined
            );
            dispatch({
              type: 'SAVE_SUCCEEDED',
              fragment: {
                ...currentFragment,
                body_html: snapshot.body_html,
                plain_text_snapshot: snapshot.plain_text,
                media_assets: stateRef.current.mediaAssets,
              },
              savedHtml: snapshot.body_html,
            });
            return;
          }

          await saveFragmentBodyDraft(currentFragmentId, snapshot.body_html);
          void enqueueRemoteFragmentBodySync(currentFragmentId, {
            delayMs: AUTOSAVE_DELAY_MS,
          }).catch(() => undefined);
          const optimisticFragment = {
            ...currentFragment,
            body_html: snapshot.body_html,
            plain_text_snapshot: snapshot.plain_text,
            media_assets: stateRef.current.mediaAssets,
          };
          await commitOptimisticFragmentRef.current(optimisticFragment);
          dispatch({
            type: 'LOCAL_SAVE_SUCCEEDED',
            fragment: optimisticFragment,
            savedHtml: snapshot.body_html,
          });
        } catch (error) {
          dispatch({
            type: 'SAVE_FAILED',
            attemptedHtml: snapshot.body_html,
            message: error instanceof Error ? error.message : '内容未同步',
          });
          throw error;
        }
      },
    })
  );

  useEffect(() => {
    /*输入停顿后只提交最后一版正文，避免一连串重复保存。 */
    if (!shouldQueueAutosave(state)) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      dispatch({ type: 'SAVE_REQUESTED' });
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  useEffect(() => {
    /*保存请求由 effect 统一消费，保持 reducer 本身无副作用。 */
    if (state.saveRequestId === 0) return;
    const latestSnapshot = getLiveSnapshot();
    void saveControllerRef.current.submitLatest(latestSnapshot).catch(() => undefined);
  }, [getLiveSnapshot, state.saveRequestId]);

  const onSnapshotChange = useCallback((snapshot: FragmentEditorSnapshot) => {
    /*bridge 输出的标准化快照直接进入会话状态机。 */
    dispatch({ type: 'SNAPSHOT_CHANGED', snapshot });
  }, []);

  const onSelectionChange = useCallback((text: string) => {
    /*只同步当前选区纯文本，供 AI patch 围绕局部上下文工作。 */
    dispatch({ type: 'SELECTION_CHANGED', text });
  }, []);

  const onFormattingStateChange = useCallback((formattingState: FragmentEditorFormattingState) => {
    /*把 DOM 工具栏态收敛进 session，页面层只消费当前 view-model。 */
    dispatch({ type: 'FORMATTING_CHANGED', formattingState });
  }, []);

  const onEditorReady = useCallback(() => {
    /*bridge 就绪后再把会话切到可交互状态。 */
    dispatch({ type: 'EDITOR_READY' });
  }, []);

  const onInsertImage = useCallback(async () => {
    /*图片插入统一回流 session，再由自动保存收敛到本地或远端。 */
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
      if (!asset?.uri || !currentFragment || !currentFragmentId) return;

      if (currentFragment.is_local_draft && currentFragment.local_id) {
        const pendingAsset = await attachPendingLocalImage(currentFragment.local_id, {
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
        void enqueueLocalFragmentSync(currentFragment.local_id, { delayMs: AUTOSAVE_DELAY_MS }).catch(
          () => undefined
        );
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

  const onAiAction = useCallback(async (_instruction: 'polish' | 'shorten' | 'expand' | 'title' | 'script_seed') => {
    /*AI patch 本期停用，保留异步签名避免页面层额外分支。 */
    setIsAiRunning(false);
  }, []);

  const saveNow = useCallback(async () => {
    /*离页前只保证本地草稿已落盘，远端同步继续后台收敛。 */
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const latestSnapshot = getLiveSnapshot();
    const currentFragment = fragmentRef.current;
    const currentFragmentId = resolvedFragmentIdRef.current;
    if (!currentFragment || !currentFragmentId) return;

    if (currentFragment.is_local_draft) {
      await saveLocalFragmentDraft(currentFragmentId, {
        body_html: latestSnapshot.body_html,
        plain_text_snapshot: latestSnapshot.plain_text,
        sync_status: currentFragment.remote_id ? 'syncing' : 'creating',
        next_retry_at: null,
      });
      void enqueueLocalFragmentSync(currentFragmentId, { delayMs: AUTOSAVE_DELAY_MS }).catch(
        () => undefined
      );
      return;
    }

    await saveFragmentBodyDraft(currentFragmentId, latestSnapshot.body_html);
    void enqueueRemoteFragmentBodySync(currentFragmentId, { force: true }).catch(() => undefined);
    dispatch({
      type: 'LOCAL_SAVE_SUCCEEDED',
      fragment: {
        ...currentFragment,
        body_html: latestSnapshot.body_html,
        plain_text_snapshot: latestSnapshot.plain_text,
        media_assets: stateRef.current.mediaAssets,
      },
      savedHtml: latestSnapshot.body_html,
    });
  }, [getLiveSnapshot]);

  const statusLabel = useMemo(() => {
    /*把内部同步态映射成页面展示文案。 */
    if (!state.isDraftHydrated || !state.isEditorReady) return null;
    if (state.syncStatus === 'syncing' || state.phase === 'saving') return '同步中';
    if (state.syncStatus === 'synced') return '已同步';
    if (state.syncStatus === 'unsynced') return '未同步';
    return null;
  }, [state.isDraftHydrated, state.isEditorReady, state.phase, state.syncStatus]);

  return {
    editorRef,
    editorKey: state.editorKey,
    initialBodyHtml: state.snapshot.body_html,
    shouldAutoFocus: Boolean(fragment?.is_local_draft && !state.snapshot.body_html.trim()),
    mediaAssets: state.mediaAssets,
    formattingState: state.formattingState,
    isDraftHydrated: state.isDraftHydrated,
    statusLabel,
    isUploadingImage,
    isAiRunning,
    saveNow,
    onEditorReady,
    onSnapshotChange,
    onSelectionChange,
    onFormattingStateChange,
    onInsertImage,
    onAiAction,
  };
}
