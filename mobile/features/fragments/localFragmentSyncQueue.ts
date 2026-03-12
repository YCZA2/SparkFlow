import {
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  normalizeBodyHtml,
} from '@/features/fragments/bodyMarkdown';
import { createFragment, fetchFragmentDetail, updateFragment, uploadImageAsset } from '@/features/fragments/api';
import {
  clearFragmentBodyDraft,
  listFragmentBodyDraftIds,
  loadFragmentBodyDraft,
} from '@/features/fragments/bodyDrafts';
import { resolveRetryDelayMs } from '@/features/fragments/localDraftState';
import { shouldRestoreLocalDraftOnLaunch } from '@/features/fragments/bodySyncPolicy';
import { shouldRecoverMissingRemoteBinding } from '@/features/fragments/localDraftSession';
import {
  peekFragmentCache,
  removeFragmentCache,
  writeFragmentCache,
} from '@/features/fragments/fragmentRepository';
import {
  bindRemoteFragmentId,
  listLocalFragmentDrafts,
  loadLocalFragmentDraft,
  markPendingImageUploaded,
  saveLocalFragmentDraft,
  updateLocalFragmentSyncState,
} from '@/features/fragments/localDrafts';
import {
  updatePendingOperationStatus,
  upsertPendingOperation,
} from '@/features/core/sync';
import {
  ensureFragmentLocalMirrorReady,
} from '@/features/fragments/store/localMirror';

const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runningDraftIds = new Set<string>();
const remoteDraftRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runningRemoteFragmentIds = new Set<string>();

/*为本地 manual fragment 同步生成稳定的 pending op 主键。 */
function buildLocalDraftPendingOpId(localId: string): string {
  return `local-fragment:${localId}`;
}

/*为远端正文草稿同步生成稳定的 pending op 主键。 */
function buildRemoteBodyPendingOpId(fragmentId: string): string {
  return `remote-body:${fragmentId}`;
}

function replaceLocalAssetReference(html: string, localAssetId: string, remoteAssetId: string): string {
  /*本地图片上传成功后把正文里的临时 asset 引用替换成远端 asset id。 */
  return normalizeBodyHtml(html.replaceAll(`asset://${localAssetId}`, `asset://${remoteAssetId}`));
}

function scheduleRetry(localId: string, delayMs: number): void {
  /*为单条草稿维持一个 retry timer，避免同一草稿并发重试。 */
  const currentTimer = retryTimers.get(localId);
  if (currentTimer) clearTimeout(currentTimer);
  retryTimers.set(
    localId,
    setTimeout(() => {
      retryTimers.delete(localId);
      void enqueueLocalFragmentSync(localId, { force: true });
    }, delayMs)
  );
}

async function ensureRemoteFragment(localId: string): Promise<string> {
  /*本地草稿首次同步时先静默建空白手动碎片，再回填 remote_id。 */
  const draft = await loadLocalFragmentDraft(localId);
  if (!draft) {
    throw new Error('本地草稿不存在');
  }
  if (draft.remote_id) return draft.remote_id;
  const fragment = await createFragment(
    {
      body_html: '',
      source: 'manual',
    },
    draft.folder_id ?? undefined
  );
  await writeFragmentCache(fragment);
  await bindRemoteFragmentId(localId, fragment.id);
  return fragment.id;
}

async function recoverMissingRemoteBinding(localId: string, staleRemoteId: string): Promise<string> {
  /*已失效的 remote_id 先解绑并清理本地镜像，再重建远端碎片绑定。 */
  await saveLocalFragmentDraft(localId, {
    remote_id: null,
    sync_status: 'creating',
    next_retry_at: null,
  });
  await removeFragmentCache(staleRemoteId);
  return await ensureRemoteFragment(localId);
}

async function uploadPendingImages(localId: string, bodyHtml: string): Promise<string> {
  /*远端 id 就绪后按顺序上传本地图片，并回写 asset:// 引用。 */
  let nextHtml = normalizeBodyHtml(bodyHtml);
  const draft = await loadLocalFragmentDraft(localId);
  if (!draft) return nextHtml;
  for (const image of draft.pending_image_assets ?? []) {
    if (image.upload_status === 'uploaded' && image.remote_asset_id) {
      nextHtml = replaceLocalAssetReference(nextHtml, image.local_asset_id, image.remote_asset_id);
      continue;
    }
    await markPendingImageUploaded(localId, image.local_asset_id, {
      remote_asset_id: image.remote_asset_id ?? null,
      upload_status: 'uploading',
    });
    try {
      const uploaded = await uploadImageAsset(image.local_uri, image.file_name, image.mime_type);
      nextHtml = replaceLocalAssetReference(nextHtml, image.local_asset_id, uploaded.id);
      await markPendingImageUploaded(localId, image.local_asset_id, {
        remote_asset_id: uploaded.id,
        upload_status: 'uploaded',
      });
    } catch (error) {
      await markPendingImageUploaded(localId, image.local_asset_id, {
        remote_asset_id: null,
        upload_status: 'failed_pending_retry',
      });
      throw error;
    }
  }
  return nextHtml;
}

async function syncLocalFragmentDraft(localId: string): Promise<void> {
  /*执行单条草稿收敛：建单、上传图片、patch 正文并回写缓存。 */
  const draft = await loadLocalFragmentDraft(localId);
  if (!draft) return;
  const now = new Date().toISOString();
  const retryCount = draft.retry_count ?? 0;
  await upsertPendingOperation({
    id: buildLocalDraftPendingOpId(localId),
    entityType: 'fragment',
    entityId: localId,
    opType: 'local_fragment_sync',
    payload: { localId },
    status: 'running',
    retryCount,
  });
  await updateLocalFragmentSyncState(localId, draft.remote_id ? 'syncing' : 'creating', {
    last_sync_attempt_at: now,
    next_retry_at: null,
  });
  try {
    let remoteId = await ensureRemoteFragment(localId);
    const latestDraft = await loadLocalFragmentDraft(localId);
    if (!latestDraft) return;
    const nextHtml = await uploadPendingImages(localId, latestDraft.body_html);
    await saveLocalFragmentDraft(localId, {
      body_html: nextHtml,
      plain_text_snapshot: extractPlainTextFromHtml(nextHtml),
    });
    let recoveryAttempted = false;
    let updatedFragment: Awaited<ReturnType<typeof updateFragment>>;
    while (true) {
      try {
        updatedFragment = await updateFragment(remoteId, {
          body_html: nextHtml,
          media_asset_ids: extractAssetIdsFromHtml(nextHtml),
        });
        break;
      } catch (error) {
        if (!shouldRecoverMissingRemoteBinding({ error, remoteId, recoveryAttempted })) {
          throw error;
        }
        recoveryAttempted = true;
        remoteId = await recoverMissingRemoteBinding(localId, remoteId);
      }
    }
    await writeFragmentCache(updatedFragment);
    await updateLocalFragmentSyncState(localId, 'synced', {
      body_html: nextHtml,
      plain_text_snapshot: extractPlainTextFromHtml(nextHtml),
      retry_count: 0,
      next_retry_at: null,
    });
    await updatePendingOperationStatus(buildLocalDraftPendingOpId(localId), 'succeeded', {
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    });
  } catch (error) {
    const latestDraft = await loadLocalFragmentDraft(localId);
    const nextRetryCount = (latestDraft?.retry_count ?? retryCount) + 1;
    const delayMs = resolveRetryDelayMs(nextRetryCount);
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    await updateLocalFragmentSyncState(localId, 'failed_pending_retry', {
      retry_count: nextRetryCount,
      next_retry_at: nextRetryAt,
    });
    await updatePendingOperationStatus(buildLocalDraftPendingOpId(localId), 'failed', {
      retryCount: nextRetryCount,
      nextRetryAt,
      lastError: error instanceof Error ? error.message : 'local fragment sync failed',
    });
    scheduleRetry(localId, delayMs);
    throw error;
  }
}

function scheduleRemoteDraftRetry(fragmentId: string, delayMs: number): void {
  /*远端碎片正文草稿也维持单独 timer，避免后台重复提交。 */
  const currentTimer = remoteDraftRetryTimers.get(fragmentId);
  if (currentTimer) clearTimeout(currentTimer);
  remoteDraftRetryTimers.set(
    fragmentId,
    setTimeout(() => {
      remoteDraftRetryTimers.delete(fragmentId);
      void enqueueRemoteFragmentBodySync(fragmentId, { force: true });
    }, delayMs)
  );
}

async function syncRemoteFragmentBodyDraft(fragmentId: string): Promise<void> {
  /*把远端碎片的本地 HTML 草稿静默推到服务端，并在成功后清理草稿。 */
  const html = await loadFragmentBodyDraft(fragmentId);
  if (!html) return;
  await upsertPendingOperation({
    id: buildRemoteBodyPendingOpId(fragmentId),
    entityType: 'fragment',
    entityId: fragmentId,
    opType: 'remote_body_sync',
    payload: { fragmentId },
    status: 'running',
  });
  const updatedFragment = await updateFragment(fragmentId, {
    body_html: html,
    media_asset_ids: extractAssetIdsFromHtml(html),
  });
  await writeFragmentCache(updatedFragment);
  await clearFragmentBodyDraft(fragmentId);
  await updatePendingOperationStatus(buildRemoteBodyPendingOpId(fragmentId), 'succeeded', {
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
  });
}

export async function enqueueLocalFragmentSync(
  localId: string,
  options?: { delayMs?: number; force?: boolean }
): Promise<void> {
  /*把草稿加入本地同步队列，按需立即执行或延后重试。 */
  const draft = await loadLocalFragmentDraft(localId);
  if (!draft) return;
  if (!options?.force && draft.next_retry_at) {
    const retryAt = Date.parse(draft.next_retry_at);
    if (!Number.isNaN(retryAt) && retryAt > Date.now()) {
      scheduleRetry(localId, retryAt - Date.now());
      return;
    }
  }
  const delayMs = options?.delayMs ?? 0;
  if (delayMs > 0) {
    scheduleRetry(localId, delayMs);
    return;
  }
  if (runningDraftIds.has(localId)) return;
  runningDraftIds.add(localId);
  try {
    await syncLocalFragmentDraft(localId);
  } finally {
    runningDraftIds.delete(localId);
  }
}

export async function enqueueRemoteFragmentBodySync(
  fragmentId: string,
  options?: { delayMs?: number; force?: boolean }
): Promise<void> {
  /*把远端碎片正文草稿加入后台同步队列，不阻塞当前编辑会话。 */
  const html = await loadFragmentBodyDraft(fragmentId);
  if (!html) return;
  const delayMs = options?.force ? 0 : options?.delayMs ?? 0;
  if (delayMs > 0) {
    scheduleRemoteDraftRetry(fragmentId, delayMs);
    return;
  }
  if (runningRemoteFragmentIds.has(fragmentId)) return;
  runningRemoteFragmentIds.add(fragmentId);
  try {
    await syncRemoteFragmentBodyDraft(fragmentId);
  } catch (error) {
    const delayMs = resolveRetryDelayMs(0);
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    await updatePendingOperationStatus(buildRemoteBodyPendingOpId(fragmentId), 'failed', {
      retryCount: 1,
      nextRetryAt,
      lastError: error instanceof Error ? error.message : 'remote body sync failed',
    });
    scheduleRemoteDraftRetry(fragmentId, delayMs);
    throw error;
  } finally {
    runningRemoteFragmentIds.delete(fragmentId);
  }
}

export async function restoreLocalFragmentSyncQueue(): Promise<void> {
  /*应用启动时恢复未收敛草稿和待上传图片的后台同步。 */
  await ensureFragmentLocalMirrorReady();
  const drafts = await listLocalFragmentDrafts();
  await Promise.all(
    drafts.map(async (draft) => {
      if (!shouldRestoreLocalDraftOnLaunch(draft)) return;
      await enqueueLocalFragmentSync(draft.local_id, { force: true });
    })
  );
}

export async function restoreRemoteFragmentBodySyncQueue(): Promise<void> {
  /*应用启动时恢复远端碎片的本地正文草稿同步。 */
  await ensureFragmentLocalMirrorReady();
  const fragmentIds = await listFragmentBodyDraftIds();
  await Promise.all(
    fragmentIds.map(async (fragmentId) => {
      await enqueueRemoteFragmentBodySync(fragmentId, { delayMs: 1200 });
    })
  );
}

export async function wakeLocalFragmentSyncQueue(): Promise<void> {
  /*列表和详情聚焦时只唤醒到期草稿，避免每次进入页面都全量重试。 */
  await ensureFragmentLocalMirrorReady();
  const drafts = await listLocalFragmentDrafts();
  await Promise.all(
    drafts.map(async (draft) => {
      if (!draft.next_retry_at) return;
      const retryAt = Date.parse(draft.next_retry_at);
      if (!Number.isNaN(retryAt) && retryAt > Date.now()) return;
      await enqueueLocalFragmentSync(draft.local_id, { force: true });
    })
  );
}

export async function wakeRemoteFragmentBodySyncQueue(): Promise<void> {
  /*页面回前台或离页时尝试收敛远端正文草稿，不覆盖当前编辑输入。 */
  await ensureFragmentLocalMirrorReady();
  const fragmentIds = await listFragmentBodyDraftIds();
  await Promise.all(
    fragmentIds.map(async (fragmentId) => {
      await enqueueRemoteFragmentBodySync(fragmentId, { force: true });
    })
  );
}

export async function refreshLocalDraftRemoteSnapshot(localId: string): Promise<void> {
  /*已绑定 remote_id 的本地草稿允许静默刷新远端详情，供详情页后台收敛。 */
  const draft = await loadLocalFragmentDraft(localId);
  if (!draft?.remote_id) return;
  const cached = peekFragmentCache(draft.remote_id)?.fragment;
  if (cached) {
    await writeFragmentCache(cached);
  }
  const remoteFragment = await fetchFragmentDetail(draft.remote_id);
  await writeFragmentCache(remoteFragment);
}
