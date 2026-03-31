import { useEffect, useMemo, useState } from 'react';
import { Alert, Share } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { getOrCreateDeviceId } from '@/features/auth/device';
import { registerFragmentCleanupTicket } from '@/features/fragments/cleanup/cleanupTicket';
import { useFragmentAudioPlayer } from '@/features/fragments/hooks/useFragmentAudioPlayer';
import { getActiveSegmentIndex } from '@/features/fragments/presenters/speakerSegments';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { deleteLocalFragmentEntity } from '@/features/fragments/store';
import { listLocalScriptsBySourceFragment } from '@/features/scripts/store';
import { getErrorMessage } from '@/utils/error';

import { useFragmentBodySession } from './useFragmentBodySession';
import { useFragmentDetailResource } from './useFragmentDetailResource';

interface FragmentDetailScreenOptions {
  exitTo?: Href | null;
  cleanupOnReturn?: 'empty_manual_placeholder' | null;
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
  const [relatedScriptsCount, setRelatedScriptsCount] = useState(0);
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

  useEffect(() => {
    let cancelled = false;
    const nextFragmentId = fragment?.id;
    if (!nextFragmentId) {
      setRelatedScriptsCount(0);
      return;
    }
    void (async () => {
      try {
        const scripts = await listLocalScriptsBySourceFragment(nextFragmentId);
        if (!cancelled) {
          setRelatedScriptsCount(scripts.length);
        }
      } catch {
        if (!cancelled) {
          setRelatedScriptsCount(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fragment?.id, fragment?.updated_at]);

  useEffect(() => {
    let cancelled = false;
    const nextFragmentId = fragment?.id;
    if (!isSheetOpen || !nextFragmentId) {
      return;
    }
    void (async () => {
      const scripts = await listLocalScriptsBySourceFragment(nextFragmentId);
      if (!cancelled) {
        setRelatedScriptsCount(scripts.length);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fragment?.id, isSheetOpen]);

  const leaveDetailScreen = () => {
    /*优先返回现有导航栈；只有无可返回历史时，才 replace 到来源页兜底。 */
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (options?.exitTo) {
      router.replace(options.exitTo);
      return;
    }
    router.replace('/');
  };

  const exitScreen = async () => {
    /*离开详情前先保证最新输入已落本地，并把空占位清理延后到上一页聚焦时处理。 */
    try {
      editor.editorRef.current?.blur?.();
      await editor.saveNow({ force: true });
      if (fragmentId && options?.cleanupOnReturn === 'empty_manual_placeholder') {
        registerFragmentCleanupTicket({
          fragmentId,
          kind: 'empty_manual_placeholder',
        });
      }
      markFragmentsStale();
      leaveDetailScreen();
    } catch {
      Alert.alert('本地保存失败', '请稍后重试，当前页会继续保留输入内容。');
      return;
    }
  };

  const exitAfterDelete = () => {
    /*删除后返回上一页，列表页会在聚焦时自动刷新。 */
    leaveDetailScreen();
  };

  const confirmDelete = async () => {
    /*删除详情时同步清理缓存和本地草稿，避免返回列表后残留旧内容。 */
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
      editor.editorRef.current?.blur?.();
      await editor.saveNow({ force: true });
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
            isFilmed: fragment.is_filmed ?? false,
            relatedScriptsCount,
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
        onShoot: openShoot,
        onOpenRelatedScripts: openRelatedScripts,
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
