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
  peekRemoteFragmentSnapshot,
  saveLocalFragmentDraft,
} from '@/features/fragments/store';
import { uploadImageAsset } from '@/features/fragments/api';
import { enqueueFragmentSync } from '@/features/fragments/localFragmentSyncQueue';
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
  return {
    id: fragment.id,
    body_html: fragment.body_html ?? '',
    media_assets: fragment.media_assets ?? [],
    is_local_draft: !fragment.server_id,
    sync_status: fragment.sync_status ?? 'pending',
  };
}

function resolveCachedBodyHtml(fragmentId: string | null, fragment: Fragment | null): string | null {
  if (!fragmentId || !fragment) return null;
  if (fragment.server_id) {
    return peekRemoteFragmentSnapshot(fragment.server_id)?.body_html ?? null;
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
  const resolvedFragmentId = fragmentId ?? fragment?.id ?? null;
  const localDraftSession = useMemo(
    () => resolveLocalDraftSession({ routeFragmentId: fragmentId, fragment }),
    [fragment, fragmentId]
  );

  const loadLocalDraft = useCallback(
    async (id: string): Promise<string | null> => {
      if (localDraftSession.draftId) {
        const draft = await loadLocalFragmentDraft(localDraftSession.draftId);
        return draft?.body_html ?? null;
      }
      return null;
    },
    [localDraftSession.draftId]
  );

  const loadCache = useCallback(
    (id: string): Promise<string | null> => {
      const cachedHtml = resolveCachedBodyHtml(id, fragment);
      return Promise.resolve(cachedHtml);
    },
    [fragment]
  );

  const saveLocally = useCallback(
    async (id: string, snapshot: EditorDocumentSnapshot): Promise<void> => {
      if (localDraftSession.draftId) {
        await saveLocalFragmentDraft(localDraftSession.draftId, {
          body_html: snapshot.body_html,
          plain_text_snapshot: snapshot.plain_text,
          sync_status: resolveLocalDraftPersistStatus({
            fragment: fragment!,
            queueRemote: false,
          }),
          next_retry_at: null,
        });
      }

      const mediaAssets: EditorMediaAsset[] = snapshot.asset_ids.map((assetId) => ({
        id: assetId,
      } as EditorMediaAsset));

      const optimisticFragment = buildOptimisticFragmentSnapshot(
        fragment!,
        snapshot,
        mediaAssets
      );
      await commitOptimisticFragment(optimisticFragment);

      const shouldSync = shouldTriggerRemoteSync({
        fragment: fragment!,
        snapshot,
        mediaAssets,
        baselineRemoteHtml: null,
        baselineMediaAssets: [],
      });

      if (shouldSync && localDraftSession.draftId) {
        void enqueueFragmentSync(localDraftSession.draftId, { force: true }).catch(() => undefined);
      }
    },
    [commitOptimisticFragment, fragment, localDraftSession.draftId]
  );

  const determineAutoFocus = useCallback(
    (snapshot: EditorDocumentSnapshot, doc: Fragment | null): boolean => {
      return Boolean(localDraftSession.isLocalDraftSession && !snapshot.body_html.trim());
    },
    [localDraftSession.isLocalDraftSession]
  );

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
    attachPendingLocalImage: localDraftSession.draftId
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
