import { useMemo, useState } from 'react';
import { Alert, Share } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { deleteFragment } from '@/features/fragments/api';
import { useFragmentAudioPlayer } from '@/features/fragments/hooks/useFragmentAudioPlayer';
import { shouldIgnoreMissingServerDeleteError } from '@/features/fragments/localDraftSession';
import { getActiveSegmentIndex } from '@/features/fragments/presenters/speakerSegments';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import {
  deleteLocalFragmentDraft,
  removeRemoteFragmentSnapshot,
} from '@/features/fragments/store';
import { getErrorMessage } from '@/utils/error';

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
    /*离开详情前先保证最新输入已落本地，并把上云动作交给后台收敛，同时标记列表待刷新。 */
    try {
      await editor.saveNow();
      // 标记碎片列表需要刷新
      markFragmentsStale();
      router.back();
    } catch {
      Alert.alert('本地保存失败', '请稍后重试，当前页会继续保留输入内容。');
      return;
    }
  };

  const exitAfterDelete = () => {
    /*删除后返回上一页，列表页会在聚焦时自动刷新。 */
    router.back();
  };

  const confirmDelete = async () => {
    /*删除详情时同步清理缓存和本地草稿，避免返回列表后残留旧内容。 */
    if (!fragmentId) return;

    try {
      setIsDeleting(true);
      const isLocalDraft = !fragment?.server_id;

      if (isLocalDraft) {
        // 本地草稿：如果有 server_id，需要先删除服务端
        if (fragment?.server_id) {
          try {
            await deleteFragment(fragment.server_id);
          } catch (error) {
            if (
              !shouldIgnoreMissingServerDeleteError({
                error,
                isLocalDraftSession: true,
                serverId: fragment.server_id,
              })
            ) {
              throw error;
            }
          }
          await removeRemoteFragmentSnapshot(fragment.server_id);
        }
        await deleteLocalFragmentDraft(fragmentId);
      } else {
        // 远程碎片直接删除
        await deleteFragment(fragmentId);
        await removeRemoteFragmentSnapshot(fragmentId);
      }

      // 标记碎片列表需要刷新
      markFragmentsStale();
      setIsSheetOpen(false);
      exitAfterDelete();
    } catch (err) {
      setIsDeleting(false);
      Alert.alert('删除失败', getErrorMessage(err, '删除失败'));
    }
  };

  const requestDelete = () => {
    /*统一处理删除确认逻辑，保持页面组件只关心点击事件。 */
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
    /*完成编辑与直接返回都复用同一套"先本地保存、再后台同步"的退出策略。 */
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
            bodyHtml: fragment.body_html,
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
        onInsertImage: editor.onInsertImage ?? (async () => {}),
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
