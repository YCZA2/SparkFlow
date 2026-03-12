import { useCallback } from 'react';
import { Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';

import { extractPlainTextFromHtml } from '@/features/editor/html';
import { useScriptDetailResource } from '@/features/scripts/detail/useScriptDetailResource';
import { useScriptBodySession } from '@/features/scripts/detail/useScriptBodySession';

export function useScriptDetailScreen(scriptId?: string | null) {
  /*聚合脚本详情资源、编辑会话和页面动作，供页面层纯渲染。 */
  const router = useRouter();
  const resource = useScriptDetailResource(scriptId);
  const editor = useScriptBodySession({
    scriptId,
    script: resource.script,
    commitOptimisticScript: resource.commitOptimisticScript,
    commitRemoteScript: resource.commitRemoteScript,
  });

  const exitScreen = useCallback(async () => {
    /*显式离开脚本编辑时必须先保存成功，避免 remote-only 会话丢稿。 */
    try {
      await editor.saveNow({ force: true });
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
    actions: {
      goBack: () => {
        void exitScreen();
      },
      done: () => {
        void exitScreen();
      },
      share,
      shoot: openShoot,
    },
  };
}
