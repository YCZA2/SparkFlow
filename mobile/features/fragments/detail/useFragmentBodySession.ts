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
import { uploadImageAsset } from '@/features/fragments/api';
import { resolveLegacyCloudBindingSession } from '@/features/fragments/legacyCloudBindingSession';
import {
  resolveLegacyCloudBindingPersistStatus,
} from '@/features/fragments/bodySyncPolicy';
import { buildOptimisticFragmentSnapshot } from '@/features/fragments/detail/bodySessionState';
import {
  readLocalFragmentEntity,
  stageLocalFragmentPendingImage,
  updateLocalFragmentEntity,
} from '@/features/fragments/store';
import { useFragmentStore } from '@/features/fragments/store/fragmentStore';
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
    is_legacy_local_document: !fragment.server_id,
    legacy_cloud_binding_status: fragment.sync_status ?? 'pending',
  };
}

function resolveCachedBodyHtml(fragmentId: string | null, fragment: Fragment | null): string | null {
  if (!fragmentId || !fragment) return null;
  return useFragmentStore.getState().getDetail(fragmentId)?.body_html ?? null;
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
  const legacyBindingSession = useMemo(
    () => resolveLegacyCloudBindingSession({ routeFragmentId: fragmentId, fragment }),
    [fragment, fragmentId]
  );

  const loadLocalDraft = useCallback(
    async (id: string): Promise<string | null> => {
      if (legacyBindingSession.draftId) {
        const fragmentEntity = await readLocalFragmentEntity(legacyBindingSession.draftId);
        return fragmentEntity?.body_html ?? null;
      }
      return null;
    },
    [legacyBindingSession.draftId]
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
      if (legacyBindingSession.draftId) {
        await updateLocalFragmentEntity(legacyBindingSession.draftId, {
          body_html: snapshot.body_html,
          plain_text_snapshot: snapshot.plain_text,
          sync_status: resolveLegacyCloudBindingPersistStatus({
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
    },
    [commitOptimisticFragment, fragment, legacyBindingSession.draftId]
  );

  const determineAutoFocus = useCallback(
    (snapshot: EditorDocumentSnapshot, doc: Fragment | null): boolean => {
      return Boolean(legacyBindingSession.isLegacyLocalFragment && !snapshot.body_html.trim());
    },
    [legacyBindingSession.isLegacyLocalFragment]
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
    attachPendingLocalImage: legacyBindingSession.draftId
      ? async (localId, payload) => {
          const result = await stageLocalFragmentPendingImage(localId, {
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
