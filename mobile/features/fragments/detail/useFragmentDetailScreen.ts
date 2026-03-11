import { useMemo, useState } from 'react';
import { Alert, Platform, Share } from 'react-native';
import { useRouter } from 'expo-router';

import { deleteFragment } from '@/features/fragments/api';
import { clearFragmentBodyDraft } from '@/features/fragments/bodyDrafts';
import { useFragmentAudioPlayer } from '@/features/fragments/hooks/useFragmentAudioPlayer';
import { getActiveSegmentIndex } from '@/features/fragments/presenters/speakerSegments';
import { removeFragmentCache } from '@/features/fragments/fragmentRepository';

import { useFragmentBodySession } from './useFragmentBodySession';
import { useFragmentDetailResource } from './useFragmentDetailResource';

export function useFragmentDetailScreen(fragmentId?: string | null) {
  /** 中文注释：编排碎片详情页交互，把页面动作与数据资源层解耦。 */
  const router = useRouter();
  const resource = useFragmentDetailResource(fragmentId);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const fragment = resource.fragment;

  const bodySession = useFragmentBodySession({
    fragmentId,
    fragment,
    commitRemoteFragment: resource.commitRemoteFragment,
    commitOptimisticFragment: resource.commitOptimisticFragment,
  });
  const player = useFragmentAudioPlayer(fragment?.audio_file_url, { enabled: isSheetOpen });
  const activeSegmentIndex = useMemo(() => {
    if (!isSheetOpen) {
      return null;
    }
    const segments = fragment?.speaker_segments;
    if (!segments?.length) {
      return null;
    }
    return getActiveSegmentIndex(segments, player.positionMs);
  }, [fragment?.speaker_segments, isSheetOpen, player.positionMs]);

  const confirmDelete = async () => {
    /** 中文注释：删除详情时同步清理缓存和本地草稿，避免返回列表后残留旧内容。 */
    if (!fragmentId) return;

    try {
      setIsDeleting(true);
      await deleteFragment(fragmentId);
      await Promise.all([removeFragmentCache(fragmentId), clearFragmentBodyDraft(fragmentId)]);
      setIsSheetOpen(false);
      router.replace({
        pathname: '/',
        params: { refresh: 'true' },
      });
    } catch (err) {
      setIsDeleting(false);
      Alert.alert('删除失败', err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleDelete = () => {
    /** 中文注释：统一处理跨平台删除确认逻辑，保持页面组件只关心点击事件。 */
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

  const handleShare = async () => {
    /** 中文注释：分享时优先读取编辑器实时快照，避免导出正文落后于当前输入。 */
    const latestSnapshot = bodySession.editorRef.current?.getSnapshot();
    const shareText = latestSnapshot?.plain_text || fragment?.plain_text_snapshot || '';
    if (!shareText.trim()) {
      Alert.alert('暂无可分享内容', '先写一点正文再分享。');
      return;
    }
    await Share.share({
      message: shareText,
    });
  };

  const handleDone = async () => {
    /** 中文注释：完成编辑前主动 flush 自动保存，失败时停留在当前页继续保留草稿。 */
    try {
      await bodySession.saveNow();
      router.back();
    } catch {
      Alert.alert('内容未同步', '内容未同步，已保留本地草稿');
    }
  };

  return {
    fragment,
    isLoading: resource.isLoading,
    error: resource.error,
    reload: resource.reload,
    bodySession,
    player,
    activeSegmentIndex,
    isDeleting,
    isSheetOpen,
    openSheet: () => setIsSheetOpen(true),
    closeSheet: () => setIsSheetOpen(false),
    goBack: () => router.back(),
    handleShare,
    handleDone,
    handleDelete,
  };
}
