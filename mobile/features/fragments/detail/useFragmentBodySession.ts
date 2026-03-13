/**
 * 碎片正文编辑会话 Hook
 *
 * 使用 useEditorSession 实现本地优先的碎片编辑功能。
 */

import { useCallback, useMemo } from 'react';

import { useEditorSession } from '@/features/editor/useEditorSession';
import type {
  EditorDocumentSnapshot,
  EditorMediaAsset,
  EditorSourceDocument,
} from '@/features/editor/types';
import {
  attachPendingLocalImage,
  loadLocalFragmentDraft,
  loadRemoteBodyDraft,
  peekRemoteFragmentSnapshot,
  saveLocalFragmentDraft,
  saveRemoteBodyDraft,
} from '@/features/fragments/store';
import { uploadImageAsset } from '@/features/fragments/api';
import {
  enqueueLocalFragmentSync,
  enqueueRemoteFragmentBodySync,
} from '@/features/fragments/localFragmentSyncQueue';
import { resolveLocalDraftSession } from '@/features/fragments/localDraftSession';
import {
  resolveLocalDraftPersistStatus,
  shouldTriggerRemoteSync,
} from '@/features/fragments/bodySyncPolicy';
import { buildOptimisticFragmentSnapshot } from '@/features/fragments/detail/bodySessionState';
import type { Fragment } from '@/types/fragment';

// ============================================================================
// 类型定义
// ============================================================================

interface UseFragmentBodySessionOptions {
  fragmentId?: string | null;
  fragment: Fragment | null;
  commitOptimisticFragment: (fragment: Fragment) => Promise<void>;
}

// ============================================================================
// 辅助函数
// ============================================================================

function buildEditorDocumentFromFragment(fragment: Fragment): EditorSourceDocument {
  /*把碎片详情映射成共享编辑器可消费的最小文档协议。 */
  return {
    id: fragment.id,
    body_html: fragment.body_html ?? '',
    media_assets: fragment.media_assets ?? [],
    is_local_draft: fragment.is_local_draft ?? false,
    local_sync_status: fragment.local_sync_status ?? null,
  };
}

function resolveCachedBodyHtml(
  fragmentId: string | null,
  fragment: Fragment | null
): string | null {
  /*按当前会话和已绑定远端 id 读取最近一次可用的正文缓存。 */
  if (!fragmentId || !fragment) return null;
  if (fragment.remote_id) {
    return peekRemoteFragmentSnapshot(fragment.remote_id)?.body_html ?? null;
  }
  return peekRemoteFragmentSnapshot(fragmentId)?.body_html ?? null;
}

// ============================================================================
// Hook 实现
// ============================================================================

export function useFragmentBodySession({
  fragmentId,
  fragment,
  commitOptimisticFragment,
}: UseFragmentBodySessionOptions) {
  /*用共享编辑器会话 hook 实现碎片正文编辑，保持本地优先策略。 */
  const resolvedFragmentId = fragmentId ?? fragment?.id ?? null;
  const localDraftSession = useMemo(
    () => resolveLocalDraftSession({ routeFragmentId: fragmentId, fragment }),
    [fragment, fragmentId]
  );

  // 加载本地草稿
  const loadLocalDraft = useCallback(
    async (id: string): Promise<string | null> => {
      if (localDraftSession.localDraftId) {
        const draft = await loadLocalFragmentDraft(localDraftSession.localDraftId);
        return draft?.body_html ?? null;
      }
      return await loadRemoteBodyDraft(id);
    },
    [localDraftSession.localDraftId]
  );

  // 加载缓存
  const loadCache = useCallback(
    (id: string): Promise<string | null> => {
      const cachedHtml = resolveCachedBodyHtml(id, fragment);
      return Promise.resolve(cachedHtml);
    },
    [fragment]
  );

  // 本地保存
  const saveLocally = useCallback(
    async (id: string, snapshot: EditorDocumentSnapshot): Promise<void> => {
      if (localDraftSession.localDraftId) {
        await saveLocalFragmentDraft(localDraftSession.localDraftId, {
          body_html: snapshot.body_html,
          plain_text_snapshot: snapshot.plain_text,
          sync_status: resolveLocalDraftPersistStatus({
            fragment: fragment!,
            queueRemote: false,
          }),
          next_retry_at: null,
        });
      } else {
        await saveRemoteBodyDraft(id, snapshot.body_html);
      }

      // 乐观更新
      const optimisticFragment = buildOptimisticFragmentSnapshot(
        fragment!,
        snapshot,
        snapshot.asset_ids.map(assetId => ({ id: assetId } as EditorMediaAsset))
      );
      await commitOptimisticFragment(optimisticFragment);

      // 触发远端同步
      const shouldSync = shouldTriggerRemoteSync({
        fragment: fragment!,
        snapshot,
        mediaAssets: snapshot.asset_ids.map(assetId => ({ id: assetId } as EditorMediaAsset)),
        baselineRemoteHtml: null,
        baselineMediaAssets: [],
      });

      if (shouldSync) {
        if (localDraftSession.localDraftId) {
          void enqueueLocalFragmentSync(localDraftSession.localDraftId, { force: true }).catch(
            () => undefined
          );
        } else {
          void enqueueRemoteFragmentBodySync(id, { force: true }).catch(() => undefined);
        }
      }
    },
    [commitOptimisticFragment, fragment, localDraftSession.localDraftId]
  );

  // 自动聚焦判断
  const determineAutoFocus = useCallback(
    (snapshot: EditorDocumentSnapshot, doc: Fragment | null): boolean => {
      return Boolean(
        localDraftSession.isLocalDraftSession && !snapshot.body_html.trim()
      );
    },
    [localDraftSession.isLocalDraftSession]
  );

  // 使用通用编辑器会话 hook
  const session = useEditorSession<Fragment>({
    documentId: resolvedFragmentId,
    document: fragment,
    persistenceMode: 'local-first',
    buildSourceDocument: buildEditorDocumentFromFragment,
    loadLocalDraft,
    loadCache,
    saveLocally,
    commitOptimistic: commitOptimisticFragment,
    supportsImages: true,
    determineAutoFocus,
    uploadImageAsset,
    attachPendingLocalImage: localDraftSession.localDraftId
      ? async (localId, payload) => {
          const result = await attachPendingLocalImage(localId, {
            local_uri: payload.local_uri,
            file_name: payload.file_name,
            mime_type: payload.mime_type,
          });
          return result;
        }
      : undefined,
    shouldSaveOnBackground: true,
    shouldSaveOnBlur: true,
  });

  return session;
}