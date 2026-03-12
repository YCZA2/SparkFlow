import { useMemo, useState } from 'react';
import { Alert, Platform, Share } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { deleteFragment } from '@/features/fragments/api';
import { clearFragmentBodyDraft } from '@/features/fragments/bodyDrafts';
import { useFragmentAudioPlayer } from '@/features/fragments/hooks/useFragmentAudioPlayer';
import { deleteLocalFragmentDraft, isLocalFragmentId } from '@/features/fragments/localDrafts';
import { getActiveSegmentIndex } from '@/features/fragments/presenters/speakerSegments';
import { removeFragmentCache } from '@/features/fragments/fragmentRepository';

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

  const exitScreen = () => {
    /*允许特定入口覆盖离开路径，避免写下灵感回退到录音页。 */
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
          await deleteFragment(fragment.remote_id);
          await removeFragmentCache(fragment.remote_id);
        }
        await deleteLocalFragmentDraft(fragmentId);
      } else {
        await deleteFragment(fragmentId);
        await Promise.all([removeFragmentCache(fragmentId), clearFragmentBodyDraft(fragmentId)]);
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
    /*完成编辑前主动 flush 自动保存，失败时停留在当前页继续保留草稿。 */
    try {
      await editor.saveNow();
      exitScreen();
    } catch {
      Alert.alert('内容未同步', '内容未同步，已保留本地草稿');
    }
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
        isUploadingImage: editor.isUploadingImage,
        isAiRunning: editor.isAiRunning,
        onInsertImage: editor.onInsertImage,
        onAiAction: editor.onAiAction,
      },
      actions: {
        isDeleting,
        onClose: () => setIsSheetOpen(false),
        onDelete: requestDelete,
      },
    },
    actions: {
      goBack: exitScreen,
      share,
      done,
      requestDelete,
    },
  };
}
