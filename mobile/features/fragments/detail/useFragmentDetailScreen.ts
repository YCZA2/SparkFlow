import { useMemo, useState } from 'react';
import { Alert, Platform, Share } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { deleteFragment } from '@/features/fragments/api';
import { useFragmentAudioPlayer } from '@/features/fragments/hooks/useFragmentAudioPlayer';
import { shouldIgnoreMissingRemoteDeleteError } from '@/features/fragments/localDraftSession';
import { getActiveSegmentIndex } from '@/features/fragments/presenters/speakerSegments';
import {
  clearRemoteBodyDraft,
  deleteLocalFragmentDraft,
  isLocalFragmentId,
  removeRemoteFragmentSnapshot,
} from '@/features/fragments/store';

import { useFragmentBodySession } from './useFragmentBodySession';
import { useFragmentDetailResource } from './useFragmentDetailResource';

interface FragmentDetailScreenOptions {
  exitTo?: Href | null;
}

export function useFragmentDetailScreen(
  fragmentId?: string | null,
  options?: FragmentDetailScreenOptions
) {
  /*聚合详情页资源、编辑会话、抽屉状态和页面动作，供页面层按分组消费。 */
  const router = useRouter();
  const resource = useFragmentDetailResource(fragmentId);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const fragment = resource.fragment;

  const editor = useFragmentBodySession({
    fragmentId,
    fragment,
    commitOptimisticFragment: resource.commitOptimisticFragment,
  });
  const player = useFragmentAudioPlayer(fragment?.audio_file_url, { enabled: isSheetOpen });
  const activeSegmentIndex = useMemo(() => {
    if (!isSheetOpen) return null;
    const segments = fragment?.speaker_segments;
    if (!segments?.length) return null;
    return getActiveSegmentIndex(segments, player.positionMs);
  }, [fragment?.speaker_segments, isSheetOpen, player.positionMs]);

  const exitScreen = async () => {
    /*离开详情前先保证最新输入已落本地，并把上云动作交给后台收敛。 */
    try {
      await editor.saveNow();
    } catch {
      Alert.alert('本地保存失败', '请稍后重试，当前页会继续保留输入内容。');
      return;
    }
    if (options?.exitTo) {
      router.replace(options.exitTo);
      return;
    }
    router.back();
  };

  const exitAfterDelete = () => {
    /*删除后默认回首页刷新，仅在特殊入口下复用覆盖路径。 */
    if (options?.exitTo) {
      router.replace(options.exitTo);
      return;
    }
    router.replace({ pathname: '/', params: { refresh: 'true' } });
  };

  const confirmDelete = async () => {
    /*删除详情时同步清理缓存和本地草稿，避免返回列表后残留旧内容。 */
    if (!fragmentId) return;

    try {
      setIsDeleting(true);
      if (isLocalFragmentId(fragmentId)) {
        if (fragment?.remote_id) {
          try {
            await deleteFragment(fragment.remote_id);
          } catch (error) {
            if (
              !shouldIgnoreMissingRemoteDeleteError({
                error,
                isLocalDraftSession: true,
                remoteId: fragment.remote_id,
              })
            ) {
              throw error;
            }
          }
          await Promise.all([
            removeRemoteFragmentSnapshot(fragment.remote_id),
            clearRemoteBodyDraft(fragment.remote_id),
          ]);
        }
        await deleteLocalFragmentDraft(fragmentId);
      } else {
        await deleteFragment(fragmentId);
        await Promise.all([
          removeRemoteFragmentSnapshot(fragmentId),
          clearRemoteBodyDraft(fragmentId),
        ]);
      }
      setIsSheetOpen(false);
      exitAfterDelete();
    } catch (err) {
      setIsDeleting(false);
      Alert.alert('删除失败', err instanceof Error ? err.message : '删除失败');
    }
  };

  const requestDelete = () => {
    /*统一处理跨平台删除确认逻辑，保持页面组件只关心点击事件。 */
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('删除后将无法恢复，是否继续？')) {
        void confirmDelete();
      }
      return;
    }

    Alert.alert('确认删除', '删除后将无法恢复，是否继续？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void confirmDelete();
        },
      },
    ]);
  };

  const share = async () => {
    /*分享时优先读取编辑器实时快照，避免导出正文落后于当前输入。 */
    const getSnapshot = editor.editorRef.current?.getSnapshot;
    const latestSnapshot = typeof getSnapshot === 'function' ? getSnapshot() : null;
    const shareText = latestSnapshot?.plain_text || fragment?.plain_text_snapshot || '';
    if (!shareText.trim()) {
      Alert.alert('暂无可分享内容', '先写一点正文再分享。');
      return;
    }
    await Share.share({
      message: shareText,
    });
  };

  const done = async () => {
    /*完成编辑与直接返回都复用同一套“先本地保存、再后台同步”的退出策略。 */
    await exitScreen();
  };

  return {
    resource: {
      fragment,
      isLoading: resource.isLoading,
      error: resource.error,
      reload: resource.reload,
    },
    editor,
    sheet: {
      isOpen: isSheetOpen,
      open: () => setIsSheetOpen(true),
      close: () => setIsSheetOpen(false),
      activeSegmentIndex,
      player,
      content: fragment
        ? {
            audioFileUrl: fragment.audio_file_url,
            transcript: fragment.transcript,
            speakerSegments: fragment.speaker_segments,
            summary: fragment.summary,
            tags: fragment.tags,
          }
        : null,
      metadata: fragment
        ? {
            source: fragment.source,
            audioSource: fragment.audio_source ?? null,
            createdAt: fragment.created_at,
            folderName: fragment.folder?.name ?? '未归档',
          }
        : null,
      tools: {
        supportsImages: true,
        isUploadingImage: editor.isUploadingImage,
        onInsertImage: editor.onInsertImage,
      },
      actions: {
        isDeleting,
        onClose: () => setIsSheetOpen(false),
        onDelete: requestDelete,
      },
    },
    actions: {
      goBack: () => {
        void exitScreen();
      },
      share,
      done,
      requestDelete,
    },
  };
}
