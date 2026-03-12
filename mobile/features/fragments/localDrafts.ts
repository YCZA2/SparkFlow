import {
  attachLocalMirrorPendingImage,
  bindLocalMirrorDraftRemoteId,
  createLocalMirrorDraft,
  deleteLocalMirrorDraft,
  ensureFragmentLocalMirrorReady,
  listLocalMirrorDrafts,
  loadLocalMirrorDraft,
  markLocalMirrorPendingImageUploaded,
  saveLocalMirrorDraft,
  subscribeFragmentMirror,
  updateLocalMirrorDraftSyncState,
} from '@/features/fragments/store/localMirror';
import {
  buildFragmentFromLocalDraft,
  mergeLocalDraftsIntoFragments,
} from '@/features/fragments/localDraftState';
import type {
  LocalFragmentDraft,
  LocalFragmentSyncStatus,
  LocalPendingImageAsset,
} from '@/types/fragment';

const LOCAL_FRAGMENT_ID_PREFIX = 'local:fragment:';

/*通过固定前缀识别本地草稿路由，保持现有页面跳转约定不变。 */
export function isLocalFragmentId(fragmentId?: string | null): boolean {
  return typeof fragmentId === 'string' && fragmentId.startsWith(LOCAL_FRAGMENT_ID_PREFIX);
}

/*把本地镜像变更广播给列表与详情，让上层继续复用订阅接口。 */
export function subscribeLocalFragmentDrafts(listener: () => void): () => void {
  return subscribeFragmentMirror(listener);
}

/*创建新的本地 manual fragment，并立即返回可进入编辑器的草稿结构。 */
export async function createLocalFragmentDraft(folderId?: string | null): Promise<LocalFragmentDraft> {
  await ensureFragmentLocalMirrorReady();
  return await createLocalMirrorDraft(folderId);
}

/*按 local_id 读取本地草稿，供详情页与同步队列恢复使用。 */
export async function loadLocalFragmentDraft(localId: string): Promise<LocalFragmentDraft | null> {
  await ensureFragmentLocalMirrorReady();
  return await loadLocalMirrorDraft(localId);
}

/*读取首页或文件夹页范围内的本地草稿，并保持创建时间倒序。 */
export async function listLocalFragmentDrafts(folderId?: string | null): Promise<LocalFragmentDraft[]> {
  await ensureFragmentLocalMirrorReady();
  return await listLocalMirrorDrafts(folderId);
}

/*按补丁保存本地草稿，让正文与待上传图片都落到本地镜像中。 */
export async function saveLocalFragmentDraft(
  localId: string,
  patch: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  await ensureFragmentLocalMirrorReady();
  return await saveLocalMirrorDraft(localId, patch);
}

/*删除本地草稿镜像，并同步回收关联待上传素材。 */
export async function deleteLocalFragmentDraft(localId: string): Promise<void> {
  await ensureFragmentLocalMirrorReady();
  await deleteLocalMirrorDraft(localId);
}

/*回填本地草稿绑定的 remote_id，维持去重和跳详情的主键映射。 */
export async function bindRemoteFragmentId(
  localId: string,
  remoteId: string
): Promise<LocalFragmentDraft | null> {
  await ensureFragmentLocalMirrorReady();
  return await bindLocalMirrorDraftRemoteId(localId, remoteId);
}

/*统一更新本地草稿同步状态，供 UI 与重试逻辑消费同一份真值。 */
export async function updateLocalFragmentSyncState(
  localId: string,
  syncStatus: LocalFragmentSyncStatus,
  patch?: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  await ensureFragmentLocalMirrorReady();
  return await updateLocalMirrorDraftSyncState(localId, syncStatus, patch);
}

/*把新选中的本地图片登记为待上传素材，并返回新的本地 asset 句柄。 */
export async function attachPendingLocalImage(
  localFragmentId: string,
  payload: Pick<LocalPendingImageAsset, 'local_uri' | 'mime_type' | 'file_name'>
): Promise<LocalPendingImageAsset | null> {
  await ensureFragmentLocalMirrorReady();
  return await attachLocalMirrorPendingImage(localFragmentId, payload);
}

/*回填待上传图片的上传状态与远端 asset id。 */
export async function markPendingImageUploaded(
  localFragmentId: string,
  localAssetId: string,
  patch: Pick<LocalPendingImageAsset, 'remote_asset_id' | 'upload_status'>
): Promise<LocalFragmentDraft | null> {
  await ensureFragmentLocalMirrorReady();
  return await markLocalMirrorPendingImageUploaded(localFragmentId, localAssetId, patch);
}

export { buildFragmentFromLocalDraft, mergeLocalDraftsIntoFragments };
