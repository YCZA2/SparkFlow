/**
 * 脚本正文编辑会话 Hook
 *
 * 使用 useEditorSession 实现远端优先的脚本编辑功能。
 */

import { useCallback } from 'react';

import { useEditorSession } from '@/features/editor/useEditorSession';
import type { EditorSourceDocument } from '@/features/editor/types';
import { updateScript } from '@/features/scripts/api';
import type { Script } from '@/types/script';

// ============================================================================
// 类型定义
// ============================================================================

interface UseScriptBodySessionOptions {
  scriptId?: string | null;
  script: Script | null;
  commitOptimisticScript: (script: Script) => Promise<void>;
  commitRemoteScript: (script: Script) => Promise<void>;
}

// ============================================================================
// 辅助函数
// ============================================================================

function buildEditorDocumentFromScript(script: Script): EditorSourceDocument {
  /*把脚本详情映射成共享编辑器可消费的最小文档协议。 */
  return {
    id: script.id,
    body_html: script.body_html ?? '',
    media_assets: [],
    is_legacy_local_document: false,
    legacy_cloud_binding_status: 'synced',
  };
}

// ============================================================================
// Hook 实现
// ============================================================================

export function useScriptBodySession({
  scriptId,
  script,
  commitOptimisticScript,
  commitRemoteScript,
}: UseScriptBodySessionOptions) {
  /*用共享编辑器会话 hook 实现脚本正文编辑，保持远端优先策略。 */
  const resolvedScriptId = scriptId ?? script?.id ?? null;

  // 远端保存
  const saveRemotely = useCallback(
    async (id: string, snapshot: any): Promise<Script> => {
      const updatedScript = await updateScript(id, {
        body_html: snapshot.body_html,
      });
      await commitRemoteScript(updatedScript);
      return updatedScript;
    },
    [commitRemoteScript]
  );

  // 使用通用编辑器会话 hook
  const session = useEditorSession<Script>({
    documentId: resolvedScriptId,
    document: script,
    persistenceMode: 'remote-only',
    buildSourceDocument: buildEditorDocumentFromScript,
    saveRemotely,
    commitOptimistic: commitOptimisticScript,
    supportsImages: false,
    shouldSaveOnBackground: true,
    shouldSaveOnBlur: true,
  });

  return session;
}
