import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Share } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';

import { getOrCreateDeviceId } from '@/features/auth/device';
import { registerFragmentCleanupTicket } from '@/features/fragments/cleanup/cleanupTicket';
import { useFragmentAudioPlayer } from '@/features/fragments/hooks/useFragmentAudioPlayer';
import { getActiveSegmentIndex } from '@/features/fragments/presenters/speakerSegments';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { deleteLocalFragmentEntity } from '@/features/fragments/store';
import { getErrorMessage } from '@/utils/error';

import {
  resolveFragmentDetailCleanupOnReturn,
  type FragmentDetailCleanupOnReturn,
} from './cleanupOnReturn';
import { resolveFragmentDetailCleanupTicket } from './exitCleanup';
import {
  buildFragmentDetailSheetContent,
  buildFragmentDetailSheetMetadata,
  useRelatedScriptsCount,
} from './fragmentDetailSheetState';
import { useFragmentBodySession } from './useFragmentBodySession';
import { useFragmentDetailResource } from './useFragmentDetailResource';

interface FragmentDetailScreenOptions {
  exitTo?: Href | null;
  cleanupOnReturn?: FragmentDetailCleanupOnReturn | undefined;
}

export function useFragmentDetailScreen(
  fragmentId?: string | null,
  options?: FragmentDetailScreenOptions
) {
  /*聚合详情页资源、编辑会话、抽屉状态和页面动作，供页面层按分组消费。 */
  const router = useRouter();
  const navigation = useNavigation();
  const resource = useFragmentDetailResource(fragmentId);
  const cleanupOnReturn = resolveFragmentDetailCleanupOnReturn(options?.cleanupOnReturn);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const skipNextCleanupTicketRef = useRef(false);
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
  const relatedScriptsCount = useRelatedScriptsCount(fragment?.id, fragment?.updated_at, isSheetOpen);
  const sheetContent = useMemo(() => buildFragmentDetailSheetContent(fragment), [fragment]);
  const sheetMetadata = useMemo(
    () => buildFragmentDetailSheetMetadata(fragment, relatedScriptsCount),
    [fragment, relatedScriptsCount]
  );

  const leaveDetailScreen = useCallback((input?: { skipCleanupTicket?: boolean }) => {
    /*优先返回现有导航栈；只有无可返回历史时，才 replace 到来源页兜底。 */
    if (input?.skipCleanupTicket) {
      skipNextCleanupTicketRef.current = true;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (options?.exitTo) {
      router.replace(options.exitTo);
      return;
    }
    router.replace('/');
  }, [options?.exitTo, router]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      const cleanupTicket = resolveFragmentDetailCleanupTicket({
        skipCleanupTicket: skipNextCleanupTicketRef.current,
        fragmentId,
        fragment,
        cleanupOnReturn,
        createdAtMs: Date.now(),
        currentSnapshot: editor.editorRef.current?.getSnapshot?.() ?? null,
      });
      skipNextCleanupTicketRef.current = false;

      if (cleanupTicket) {
        registerFragmentCleanupTicket(cleanupTicket);
      }
      markFragmentsStale();
    });

    return unsubscribe;
  }, [cleanupOnReturn, editor.editorRef, fragment, fragmentId, navigation]);

  const exitAfterDelete = () => {
    /*删除后返回时跳过空碎片 cleanup ticket 登记，避免重复走返回清理。 */
    leaveDetailScreen({ skipCleanupTicket: true });
  };

  const confirmDelete = async () => {
    /*删除详情时同步清理缓存和本地待同步正文，避免返回列表后残留旧内容。 */
    if (!fragmentId) return;

    try {
      setIsDeleting(true);
      const deviceId = await getOrCreateDeviceId();
      await deleteLocalFragmentEntity(fragmentId, { deviceId });

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
    /*右上角对勾只负责显式保存并收起键盘，保留当前详情页继续编辑。 */
    try {
      await editor.finishEditing();
      markFragmentsStale();
    } catch {
      Alert.alert('本地保存失败', '请稍后重试，当前页会继续保留输入内容。');
    }
  };

  const openShoot = () => {
    /*碎片拍摄也走统一提词页，并优先携带当前编辑快照。 */
    const currentHtml =
      editor.editorRef.current?.getSnapshot?.()?.body_html ?? fragment?.body_html ?? '';
    if (!fragment?.id) return;
    setIsSheetOpen(false);
    router.push({
      pathname: '/shoot',
      params: {
        fragment_id: fragment.id,
        body_html: currentHtml,
      },
    });
  };

  const openRelatedScripts = () => {
    /*从碎片详情跳到关联成稿列表，保持列表与详情边界分离。 */
    if (!fragment?.id) return;
    setIsSheetOpen(false);
    router.push({
      pathname: '/scripts',
      params: {
        source_fragment_id: fragment.id,
      },
    });
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
      content: sheetContent,
      metadata: sheetMetadata,
      tools: {
        supportsImages: true,
        isUploadingImage: editor.isUploadingImage,
        onInsertImage: editor.onInsertImage ?? (async () => {}),
      },
      actions: {
        isDeleting,
        onClose: () => setIsSheetOpen(false),
        onShoot: openShoot,
        onOpenRelatedScripts: openRelatedScripts,
        onDelete: requestDelete,
      },
    },
    actions: {
      goBack: () => leaveDetailScreen(),
      share,
      done,
      requestDelete,
    },
  };
}
