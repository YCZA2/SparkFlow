/**
 * 脚本正文编辑会话 Hook
 *
 * 使用 useEditorSession 实现本地优先的脚本编辑功能。
 */

import { useCallback } from 'react';

import { useEditorSession } from '@/features/editor/useEditorSession';
import type { EditorDocumentSnapshot, EditorSourceDocument } from '@/features/editor/types';
import { updateScript } from '@/features/scripts/api';
import { markScriptsStale } from '@/features/scripts/refreshSignal';
import { updateLocalScriptEntity } from '@/features/scripts/store';
import type { Script } from '@/types/script';

// ============================================================================
// 类型定义
// ============================================================================

interface UseScriptBodySessionOptions {
  scriptId?: string | null;
  script: Script | null;
  commitOptimisticScript: (script: Script) => Promise<void>;
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
  };
}

// ============================================================================
// Hook 实现
// ============================================================================

export function useScriptBodySession({
  scriptId,
  script,
  commitOptimisticScript,
}: UseScriptBodySessionOptions) {
  /*用共享编辑器会话 hook 实现脚本正文编辑，先落本地再最佳努力同步远端。 */
  const resolvedScriptId = scriptId ?? script?.id ?? null;

  const saveLocally = useCallback(
    async (id: string, snapshot: EditorDocumentSnapshot): Promise<void> => {
      const updatedScript = await updateLocalScriptEntity(id, {
        body_html: snapshot.body_html,
        plain_text_snapshot: snapshot.plain_text,
      });
      if (updatedScript) {
        await commitOptimisticScript(updatedScript);
      }
      markScriptsStale();
      void updateScript(id, {
        body_html: snapshot.body_html,
      }).catch(() => undefined);
    },
    [commitOptimisticScript]
  );

  const session = useEditorSession<Script>({
    documentId: resolvedScriptId,
    document: script,
    persistenceMode: 'local-first',
    buildSourceDocument: buildEditorDocumentFromScript,
    saveLocally,
    commitOptimistic: commitOptimisticScript,
    supportsImages: false,
    shouldSaveOnBackground: true,
    shouldSaveOnBlur: true,
  });

  return session;
}
