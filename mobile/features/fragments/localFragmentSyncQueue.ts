import { extractAssetIdsFromMarkdown, extractPlainTextFromMarkdown, normalizeBodyMarkdown } from '@/features/fragments/bodyMarkdown';
import { createFragment, fetchFragmentDetail, updateFragment, uploadImageAsset } from '@/features/fragments/api';
import { resolveRetryDelayMs } from '@/features/fragments/localDraftState';
import { peekFragmentCache, writeFragmentCache } from '@/features/fragments/fragmentRepository';
import {
  bindRemoteFragmentId,
  listLocalFragmentDrafts,
  loadLocalFragmentDraft,
  markPendingImageUploaded,
  saveLocalFragmentDraft,
  updateLocalFragmentSyncState,
} from '@/features/fragments/localDrafts';

const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runningDraftIds = new Set<string>();

function replaceLocalAssetReference(markdown: string, localAssetId: string, remoteAssetId: string): string {
  /*本地图片上传成功后把正文里的临时 asset 引用替换成远端 asset id。 */
  return normalizeBodyMarkdown(markdown.replaceAll(`asset://${localAssetId}`, `asset://${remoteAssetId}`));
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
      body_markdown: '',
      source: 'manual',
    },
    draft.folder_id ?? undefined
  );
  await writeFragmentCache(fragment);
  await bindRemoteFragmentId(localId, fragment.id);
  return fragment.id;
}

async function uploadPendingImages(localId: string, bodyMarkdown: string): Promise<string> {
  /*远端 id 就绪后按顺序上传本地图片，并回写 asset:// 引用。 */
  let nextMarkdown = normalizeBodyMarkdown(bodyMarkdown);
  const draft = await loadLocalFragmentDraft(localId);
  if (!draft) return nextMarkdown;
  for (const image of draft.pending_image_assets ?? []) {
    if (image.upload_status === 'uploaded' && image.remote_asset_id) {
      nextMarkdown = replaceLocalAssetReference(nextMarkdown, image.local_asset_id, image.remote_asset_id);
      continue;
    }
    await markPendingImageUploaded(localId, image.local_asset_id, {
      remote_asset_id: image.remote_asset_id ?? null,
      upload_status: 'uploading',
    });
    try {
      const uploaded = await uploadImageAsset(image.local_uri, image.file_name, image.mime_type);
      nextMarkdown = replaceLocalAssetReference(nextMarkdown, image.local_asset_id, uploaded.id);
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
  return nextMarkdown;
}

async function syncLocalFragmentDraft(localId: string): Promise<void> {
  /*执行单条草稿收敛：建单、上传图片、patch 正文并回写缓存。 */
  const draft = await loadLocalFragmentDraft(localId);
  if (!draft) return;
  const now = new Date().toISOString();
  const retryCount = draft.retry_count ?? 0;
  await updateLocalFragmentSyncState(localId, draft.remote_id ? 'syncing' : 'creating', {
    last_sync_attempt_at: now,
    next_retry_at: null,
  });
  try {
    const remoteId = await ensureRemoteFragment(localId);
    const latestDraft = await loadLocalFragmentDraft(localId);
    if (!latestDraft) return;
    const nextMarkdown = await uploadPendingImages(localId, latestDraft.body_markdown);
    await saveLocalFragmentDraft(localId, {
      body_markdown: nextMarkdown,
      plain_text_snapshot: extractPlainTextFromMarkdown(nextMarkdown),
    });
    const updatedFragment = await updateFragment(remoteId, {
      body_markdown: nextMarkdown,
      media_asset_ids: extractAssetIdsFromMarkdown(nextMarkdown),
    });
    await writeFragmentCache(updatedFragment);
    await updateLocalFragmentSyncState(localId, 'synced', {
      body_markdown: nextMarkdown,
      plain_text_snapshot: extractPlainTextFromMarkdown(nextMarkdown),
      retry_count: 0,
      next_retry_at: null,
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
    scheduleRetry(localId, delayMs);
    throw error;
  }
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

export async function restoreLocalFragmentSyncQueue(): Promise<void> {
  /*应用启动时恢复未收敛草稿和待上传图片的后台同步。 */
  const drafts = await listLocalFragmentDrafts();
  await Promise.all(
    drafts.map(async (draft) => {
      if (draft.sync_status === 'synced') {
        const hasPendingImages = (draft.pending_image_assets ?? []).some(
          (item) => item.upload_status !== 'uploaded'
        );
        if (!hasPendingImages) return;
      }
      await enqueueLocalFragmentSync(draft.local_id, { force: true });
    })
  );
}

export async function wakeLocalFragmentSyncQueue(): Promise<void> {
  /*列表和详情聚焦时只唤醒到期草稿，避免每次进入页面都全量重试。 */
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
