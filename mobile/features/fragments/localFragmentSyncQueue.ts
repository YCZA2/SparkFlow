import {
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  normalizeBodyHtml,
} from '@/features/editor/html';
import { createFragment, fetchFragmentDetail, updateFragment, uploadImageAsset } from '@/features/fragments/api';
import {
  ensureFragmentStoreReady,
  listLocalFragmentDrafts,
  loadLocalFragmentDraft,
  saveLocalFragmentDraft,
  updatePendingOperationStatus,
  upsertPendingOperation,
  upsertRemoteFragmentSnapshot,
  bindServerId,
  markPendingImageUploaded,
  updateLocalFragmentSyncState,
} from '@/features/fragments/store';
import { useFragmentStore } from '@/features/fragments/store/fragmentStore';
import { resolveRetryDelayMs } from '@/features/fragments/localDraftState';
import { shouldRestoreLocalDraftOnLaunch } from '@/features/fragments/bodySyncPolicy';

const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runningFragmentIds = new Set<string>();

/*为 fragment 同步生成稳定的 pending op 主键。 */
function buildFragmentPendingOpId(fragmentId: string): string {
  return `fragment:${fragmentId}`;
}

function replaceLocalAssetReference(html: string, localAssetId: string, remoteAssetId: string): string {
  /*本地图片上传成功后把正文里的临时 asset 引用替换成远端 asset id。 */
  return normalizeBodyHtml(html.replaceAll(`asset://${localAssetId}`, `asset://${remoteAssetId}`));
}

function scheduleRetry(fragmentId: string, delayMs: number): void {
  /*为单条 fragment 维持一个 retry timer，避免同一 fragment 并发重试。 */
  const currentTimer = retryTimers.get(fragmentId);
  if (currentTimer) clearTimeout(currentTimer);
  retryTimers.set(
    fragmentId,
    setTimeout(() => {
      retryTimers.delete(fragmentId);
      void enqueueFragmentSync(fragmentId, { force: true });
    }, delayMs)
  );
}

async function ensureServerFragment(fragmentId: string): Promise<string> {
  /*本地草稿首次同步时先静默建空白手动碎片，再回填 server_id。 */
  const draft = await loadLocalFragmentDraft(fragmentId);
  if (!draft) {
    throw new Error('本地草稿不存在');
  }
  if (draft.server_id) return draft.server_id;
  const fragment = await createFragment(
    {
      body_html: '',
      source: 'manual',
    },
    draft.folder_id ?? undefined
  );
  await upsertRemoteFragmentSnapshot(fragment);
  await bindServerId(fragmentId, fragment.id);
  return fragment.id;
}

async function recoverMissingServerBinding(fragmentId: string, staleServerId: string): Promise<string> {
  /*已失效的 server_id 先解绑并清理本地镜像，再重建服务端碎片绑定。 */
  await saveLocalFragmentDraft(fragmentId, {
    server_id: null,
    sync_status: 'pending',
    next_retry_at: null,
  });
  return await ensureServerFragment(fragmentId);
}

async function uploadPendingImages(fragmentId: string, bodyHtml: string): Promise<string> {
  /*服务端 id 就绪后按顺序上传本地图片，并回写 asset:// 引用。 */
  let nextHtml = normalizeBodyHtml(bodyHtml);
  const draft = await loadLocalFragmentDraft(fragmentId);
  if (!draft) return nextHtml;
  for (const image of draft.pending_image_assets ?? []) {
    if (image.upload_status === 'uploaded' && image.remote_asset_id) {
      nextHtml = replaceLocalAssetReference(nextHtml, image.local_asset_id, image.remote_asset_id);
      continue;
    }
    await markPendingImageUploaded(fragmentId, image.local_asset_id, {
      remote_asset_id: image.remote_asset_id ?? null,
      upload_status: 'uploading',
    });
    try {
      const uploaded = await uploadImageAsset(image.local_uri, image.file_name, image.mime_type);
      nextHtml = replaceLocalAssetReference(nextHtml, image.local_asset_id, uploaded.id);
      await markPendingImageUploaded(fragmentId, image.local_asset_id, {
        remote_asset_id: uploaded.id,
        upload_status: 'uploaded',
      });
    } catch (error) {
      await markPendingImageUploaded(fragmentId, image.local_asset_id, {
        remote_asset_id: null,
        upload_status: 'failed_pending_retry',
      });
      throw error;
    }
  }
  return nextHtml;
}

async function syncFragment(fragmentId: string): Promise<void> {
  /*执行单条 fragment 收敛：建单、上传图片、patch 正文并回写缓存。 */
  const draft = await loadLocalFragmentDraft(fragmentId);
  if (!draft) return;
  const now = new Date().toISOString();
  const retryCount = draft.retry_count ?? 0;
  await upsertPendingOperation({
    id: buildFragmentPendingOpId(fragmentId),
    entityType: 'fragment',
    entityId: fragmentId,
    opType: 'fragment_sync',
    payload: { fragmentId },
    status: 'running',
    retryCount,
  });
  await updateLocalFragmentSyncState(fragmentId, 'pending', {
    last_sync_attempt_at: now,
    next_retry_at: null,
  });
  try {
    let serverId = await ensureServerFragment(fragmentId);
    const latestDraft = await loadLocalFragmentDraft(fragmentId);
    if (!latestDraft) return;
    const nextHtml = await uploadPendingImages(fragmentId, latestDraft.body_html);
    await saveLocalFragmentDraft(fragmentId, {
      body_html: nextHtml,
      plain_text_snapshot: extractPlainTextFromHtml(nextHtml),
    });
    let recoveryAttempted = false;
    let updatedFragment: Awaited<ReturnType<typeof updateFragment>>;
    while (true) {
      try {
        updatedFragment = await updateFragment(serverId, {
          body_html: nextHtml,
          media_asset_ids: extractAssetIdsFromHtml(nextHtml),
        });
        break;
      } catch (error) {
        const isNotFoundError = error instanceof Error && error.message.includes('NOT_FOUND');
        if (!isNotFoundError || recoveryAttempted || !serverId) {
          throw error;
        }
        recoveryAttempted = true;
        serverId = await recoverMissingServerBinding(fragmentId, serverId);
      }
    }
    await upsertRemoteFragmentSnapshot(updatedFragment);
    await updateLocalFragmentSyncState(fragmentId, 'synced', {
      body_html: nextHtml,
      plain_text_snapshot: extractPlainTextFromHtml(nextHtml),
      retry_count: 0,
      next_retry_at: null,
    });
    await updatePendingOperationStatus(buildFragmentPendingOpId(fragmentId), 'succeeded', {
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    });
    // 同步成功后刷新 Zustand store
    const latestDrafts = await listLocalFragmentDrafts();
    useFragmentStore.getState().setLocalDrafts(null, latestDrafts);
  } catch (error) {
    const latestDraft = await loadLocalFragmentDraft(fragmentId);
    const nextRetryCount = (latestDraft?.retry_count ?? retryCount) + 1;
    const delayMs = resolveRetryDelayMs(nextRetryCount);
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    await updateLocalFragmentSyncState(fragmentId, 'pending', {
      retry_count: nextRetryCount,
      next_retry_at: nextRetryAt,
    });
    await updatePendingOperationStatus(buildFragmentPendingOpId(fragmentId), 'failed', {
      retryCount: nextRetryCount,
      nextRetryAt,
      lastError: error instanceof Error ? error.message : 'fragment sync failed',
    });
    scheduleRetry(fragmentId, delayMs);
    throw error;
  }
}

export async function enqueueFragmentSync(
  fragmentId: string,
  options?: { delayMs?: number; force?: boolean }
): Promise<void> {
  /*把 fragment 加入同步队列，按需立即执行或延后重试。 */
  const draft = await loadLocalFragmentDraft(fragmentId);
  if (!draft) return;
  // 已同步的不再重复同步
  if (draft.sync_status === 'synced' && !options?.force) return;

  if (!options?.force && draft.next_retry_at) {
    const retryAt = Date.parse(draft.next_retry_at);
    if (!Number.isNaN(retryAt) && retryAt > Date.now()) {
      scheduleRetry(fragmentId, retryAt - Date.now());
      return;
    }
  }
  const delayMs = options?.delayMs ?? 0;
  if (delayMs > 0) {
    scheduleRetry(fragmentId, delayMs);
    return;
  }
  if (runningFragmentIds.has(fragmentId)) return;
  runningFragmentIds.add(fragmentId);
  try {
    await syncFragment(fragmentId);
  } finally {
    runningFragmentIds.delete(fragmentId);
  }
}

/*同步单个 fragment 并等待完成（供 AI 编导前强制同步使用）。 */
export async function syncFragmentAndWait(fragmentId: string): Promise<void> {
  const draft = await loadLocalFragmentDraft(fragmentId);
  if (!draft || draft.sync_status === 'synced') return;
  await enqueueFragmentSync(fragmentId, { force: true });
}

export async function restoreFragmentSyncQueue(): Promise<void> {
  /*应用启动时恢复未收敛 fragment 的后台同步。 */
  await ensureFragmentStoreReady();
  const drafts = await listLocalFragmentDrafts();
  await Promise.all(
    drafts.map(async (draft) => {
      if (!shouldRestoreLocalDraftOnLaunch(draft)) return;
      await enqueueFragmentSync(draft.id, { force: true });
    })
  );
}

export async function wakeFragmentSyncQueue(): Promise<void> {
  /*列表和详情聚焦时只唤醒到期 fragment，避免每次进入页面都全量重试。 */
  await ensureFragmentStoreReady();
  const drafts = await listLocalFragmentDrafts();
  await Promise.all(
    drafts.map(async (draft) => {
      if (!draft.next_retry_at) return;
      const retryAt = Date.parse(draft.next_retry_at);
      if (!Number.isNaN(retryAt) && retryAt > Date.now()) return;
      await enqueueFragmentSync(draft.id, { force: true });
    })
  );
}

export async function refreshFragmentRemoteSnapshot(fragmentId: string): Promise<void> {
  /*已绑定 server_id 的 fragment 允许静默刷新远端详情，供详情页后台收敛。 */
  const draft = await loadLocalFragmentDraft(fragmentId);
  if (!draft?.server_id) return;
  const remoteFragment = await fetchFragmentDetail(draft.server_id);
  await upsertRemoteFragmentSnapshot(remoteFragment);
}
