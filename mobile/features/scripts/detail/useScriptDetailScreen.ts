import { useCallback, useMemo, useState } from 'react';
import { Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';

import { extractPlainTextFromHtml } from '@/features/editor/html';
import { markScriptsStale } from '@/features/scripts/refreshSignal';
import { useScriptDetailResource } from '@/features/scripts/detail/useScriptDetailResource';
import { useScriptBodySession } from '@/features/scripts/detail/useScriptBodySession';

export function useScriptDetailScreen(scriptId?: string | null) {
  /*聚合脚本详情资源、编辑会话和页面动作，供页面层纯渲染。 */
  const router = useRouter();
  const resource = useScriptDetailResource(scriptId);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const editor = useScriptBodySession({
    scriptId,
    script: resource.script,
    commitOptimisticScript: resource.commitOptimisticScript,
  });
  const sourceFragments = useMemo(
    () => (resource.script?.source_fragment_ids ?? []).map((fragmentId) => ({ id: fragmentId })),
    [resource.script?.source_fragment_ids]
  );

  const exitScreen = useCallback(async () => {
    /*离开脚本详情前先把本地真值固化，再标记列表需要刷新。 */
    try {
      await editor.finishEditing();
      markScriptsStale();
      router.back();
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '保存失败，请重试');
    }
  }, [editor, router]);

  const share = useCallback(async () => {
    /*分享时优先读取编辑器实时快照，避免导出的正文落后于当前输入。 */
    const getSnapshot = editor.editorRef.current?.getSnapshot;
    const latestSnapshot = typeof getSnapshot === 'function' ? getSnapshot() : null;
    const shareText = latestSnapshot?.plain_text || extractPlainTextFromHtml(resource.script?.body_html);
    if (!shareText.trim()) {
      Alert.alert('暂无可分享内容', '先写一点正文再分享。');
      return;
    }
    await Share.share({ message: shareText });
  }, [editor.editorRef, resource.script?.body_html]);

  const done = useCallback(async () => {
    /*右上角对勾只负责显式保存并收起键盘，保留当前成稿页继续编辑。 */
    try {
      await editor.finishEditing();
      markScriptsStale();
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '保存失败，请重试');
    }
  }, [editor]);

  const openShoot = useCallback(() => {
    /*拍摄入口始终携带当前编辑快照，保证提词内容与页面一致。 */
    const currentHtml =
      editor.editorRef.current?.getSnapshot?.()?.body_html ?? resource.script?.body_html ?? '';
    if (!resource.script?.id) return;
    router.push({
      pathname: '/shoot',
      params: {
        script_id: resource.script.id,
        body_html: currentHtml,
      },
    });
  }, [editor.editorRef, resource.script, router]);

  return {
    resource,
    editor,
    sheet: {
      isOpen: isSheetOpen,
      open: () => setIsSheetOpen(true),
      close: () => setIsSheetOpen(false),
      metadata: resource.script
        ? {
            mode: resource.script.mode,
            generationKind: resource.script.generation_kind ?? (resource.script.is_daily_push ? 'daily_push' : 'manual'),
            createdAt: resource.script.created_at,
            isFilmed: resource.script.is_filmed ?? resource.script.status === 'filmed',
            sourceFragmentCount: resource.script.source_fragment_count,
          }
        : null,
      sourceFragments,
      actions: {
        onClose: () => setIsSheetOpen(false),
        onShoot: openShoot,
        onOpenFragment: (fragmentId: string) => {
          setIsSheetOpen(false);
          router.push(`/fragment/${fragmentId}`);
        },
      },
    },
    actions: {
      goBack: () => {
        void exitScreen();
      },
      done: () => {
        void done();
      },
      share,
    },
  };
}
