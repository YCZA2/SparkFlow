import AsyncStorage from '@react-native-async-storage/async-storage';

import { extractPlainTextFromHtml, normalizeBodyHtml } from '@/features/fragments/bodyMarkdown';
import {
  buildFragmentFromLocalDraft,
  mergeLocalDraftsIntoFragments,
} from '@/features/fragments/localDraftState';
import type {
  Fragment,
  LocalFragmentDraft,
  LocalFragmentSyncStatus,
  LocalPendingImageAsset,
} from '@/types/fragment';

const LOCAL_DRAFTS_STORAGE_KEY = '@local_fragment_drafts:v1';
const LOCAL_FRAGMENT_ID_PREFIX = 'local:fragment:';
const LOCAL_IMAGE_ASSET_ID_PREFIX = 'local:image:';

let draftsCache: LocalFragmentDraft[] | null = null;
const listeners = new Set<() => void>();

function emitDraftChange(): void {
  /*本地草稿变更后广播，驱动列表和详情即时刷新。 */
  listeners.forEach((listener) => listener());
}

function generateLocalId(prefix: string): string {
  /*使用时间戳和随机尾巴生成稳定本地标识，避免真机重启后冲突。 */
  return `${prefix}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePendingImageAsset(asset: LocalPendingImageAsset): LocalPendingImageAsset {
  /*统一收敛本地图片待上传结构，避免老缓存缺字段时崩溃。 */
  return {
    local_asset_id: asset.local_asset_id,
    local_fragment_id: asset.local_fragment_id,
    local_uri: asset.local_uri,
    mime_type: asset.mime_type,
    file_name: asset.file_name,
    remote_asset_id: asset.remote_asset_id ?? null,
    upload_status: asset.upload_status,
  };
}

function normalizeDraft(draft: LocalFragmentDraft): LocalFragmentDraft {
  /*读取持久化草稿时补齐默认字段，并重新生成纯文本快照。 */
  const legacyBodyHtml = (draft as LocalFragmentDraft & { body_markdown?: string }).body_markdown;
  const bodyHtml = normalizeBodyHtml(draft.body_html ?? legacyBodyHtml ?? '');
  return {
    local_id: draft.local_id,
    remote_id: draft.remote_id ?? null,
    folder_id: draft.folder_id ?? null,
    body_html: bodyHtml,
    plain_text_snapshot:
      String(draft.plain_text_snapshot ?? '').trim() || extractPlainTextFromHtml(bodyHtml),
    created_at: draft.created_at,
    sync_status: draft.sync_status,
    last_sync_attempt_at: draft.last_sync_attempt_at ?? null,
    next_retry_at: draft.next_retry_at ?? null,
    retry_count: Number.isFinite(draft.retry_count) ? Number(draft.retry_count) : 0,
    pending_image_assets: Array.isArray(draft.pending_image_assets)
      ? draft.pending_image_assets.map(normalizePendingImageAsset)
      : [],
  };
}

async function persistDrafts(nextDrafts: LocalFragmentDraft[]): Promise<void> {
  /*统一管理草稿落盘和内存镜像，避免多个调用点各自写存储。 */
  draftsCache = nextDrafts.map(normalizeDraft);
  await AsyncStorage.setItem(LOCAL_DRAFTS_STORAGE_KEY, JSON.stringify(draftsCache));
  emitDraftChange();
}

async function loadAllDrafts(): Promise<LocalFragmentDraft[]> {
  /*首次读取时从 AsyncStorage hydrate 本地草稿列表。 */
  if (draftsCache) return draftsCache;
  try {
    const raw = await AsyncStorage.getItem(LOCAL_DRAFTS_STORAGE_KEY);
    if (!raw) {
      draftsCache = [];
      return draftsCache;
    }
    const parsed = JSON.parse(raw);
    draftsCache = Array.isArray(parsed) ? parsed.map((item) => normalizeDraft(item as LocalFragmentDraft)) : [];
    return draftsCache;
  } catch {
    draftsCache = [];
    return draftsCache;
  }
}

export function isLocalFragmentId(fragmentId?: string | null): boolean {
  /*通过固定前缀识别本地草稿路由。 */
  return typeof fragmentId === 'string' && fragmentId.startsWith(LOCAL_FRAGMENT_ID_PREFIX);
}

export function subscribeLocalFragmentDrafts(listener: () => void): () => void {
  /*提供本地草稿订阅能力，供列表和详情监听更新。 */
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function createLocalFragmentDraft(folderId?: string | null): Promise<LocalFragmentDraft> {
  /*创建本地草稿时立即生成 local_id 并落盘，不等待远端建单。 */
  const nextDraft: LocalFragmentDraft = {
    local_id: generateLocalId(LOCAL_FRAGMENT_ID_PREFIX),
    remote_id: null,
    folder_id: folderId ?? null,
    body_html: '',
    plain_text_snapshot: '',
    created_at: new Date().toISOString(),
    sync_status: 'creating',
    last_sync_attempt_at: null,
    next_retry_at: null,
    retry_count: 0,
    pending_image_assets: [],
  };
  const drafts = await loadAllDrafts();
  await persistDrafts([nextDraft, ...drafts]);
  return nextDraft;
}

export async function loadLocalFragmentDraft(localId: string): Promise<LocalFragmentDraft | null> {
  /*按 local_id 读取单条草稿，供详情和同步队列恢复。 */
  const drafts = await loadAllDrafts();
  return drafts.find((item) => item.local_id === localId) ?? null;
}

export async function listLocalFragmentDrafts(folderId?: string | null): Promise<LocalFragmentDraft[]> {
  /*按首页或文件夹范围读取本地草稿，并保持最新创建的内容靠前。 */
  const drafts = await loadAllDrafts();
  const normalizedFolderId = String(folderId ?? '').trim();
  return drafts
    .filter((item) =>
      normalizedFolderId ? (item.folder_id ?? null) === normalizedFolderId : true
    )
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
}

export async function saveLocalFragmentDraft(
  localId: string,
  patch: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  /*按补丁更新本地草稿，并重新计算正文快照。 */
  const drafts = await loadAllDrafts();
  const nextDrafts = drafts.map((item) => {
    if (item.local_id !== localId) return item;
    const bodyHtml = normalizeBodyHtml(
      typeof patch.body_html === 'string' ? patch.body_html : item.body_html
    );
    return normalizeDraft({
      ...item,
      ...patch,
      body_html: bodyHtml,
      plain_text_snapshot:
        typeof patch.plain_text_snapshot === 'string'
          ? patch.plain_text_snapshot
          : extractPlainTextFromHtml(bodyHtml),
    });
  });
  const updated = nextDrafts.find((item) => item.local_id === localId) ?? null;
  if (!updated) return null;
  await persistDrafts(nextDrafts);
  return updated;
}

export async function deleteLocalFragmentDraft(localId: string): Promise<void> {
  /*删除本地草稿时同步从存储和内存镜像移除。 */
  const drafts = await loadAllDrafts();
  await persistDrafts(drafts.filter((item) => item.local_id !== localId));
}

export async function bindRemoteFragmentId(
  localId: string,
  remoteId: string
): Promise<LocalFragmentDraft | null> {
  /*远端建单成功后把 remote_id 回填到本地草稿，维持去重主键映射。 */
  return saveLocalFragmentDraft(localId, {
    remote_id: remoteId,
  });
}

export async function updateLocalFragmentSyncState(
  localId: string,
  syncStatus: LocalFragmentSyncStatus,
  patch?: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  /*同步队列统一通过这里更新状态时间戳和退避信息。 */
  return saveLocalFragmentDraft(localId, {
    ...patch,
    sync_status: syncStatus,
  });
}

export async function attachPendingLocalImage(
  localFragmentId: string,
  payload: Pick<LocalPendingImageAsset, 'local_uri' | 'mime_type' | 'file_name'>
): Promise<LocalPendingImageAsset | null> {
  /*插图先登记为本地待上传资产，让编辑器立刻可见。 */
  const draft = await loadLocalFragmentDraft(localFragmentId);
  if (!draft) return null;
  const pendingImage: LocalPendingImageAsset = {
    local_asset_id: generateLocalId(LOCAL_IMAGE_ASSET_ID_PREFIX),
    local_fragment_id: localFragmentId,
    local_uri: payload.local_uri,
    mime_type: payload.mime_type,
    file_name: payload.file_name,
    remote_asset_id: null,
    upload_status: 'pending',
  };
  await saveLocalFragmentDraft(localFragmentId, {
    pending_image_assets: [...(draft.pending_image_assets ?? []), pendingImage],
  });
  return pendingImage;
}

export async function markPendingImageUploaded(
  localFragmentId: string,
  localAssetId: string,
  patch: Pick<LocalPendingImageAsset, 'remote_asset_id' | 'upload_status'>
): Promise<LocalFragmentDraft | null> {
  /*图片上传队列回填远端 asset id，并保留失败状态给后续重试。 */
  const draft = await loadLocalFragmentDraft(localFragmentId);
  if (!draft) return null;
  const nextPendingAssets = (draft.pending_image_assets ?? []).map((item) =>
    item.local_asset_id === localAssetId ? normalizePendingImageAsset({ ...item, ...patch }) : item
  );
  return saveLocalFragmentDraft(localFragmentId, {
    pending_image_assets: nextPendingAssets,
  });
}

export { buildFragmentFromLocalDraft, mergeLocalDraftsIntoFragments };
