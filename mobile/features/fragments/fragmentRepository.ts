import type { Fragment } from '@/types/fragment';

import {
  ensureFragmentLocalMirrorReady,
  peekRemoteFragmentSnapshot,
  prewarmRemoteFragmentSnapshot,
  readRemoteFragmentList,
  readRemoteFragmentSnapshot,
  removeRemoteFragmentSnapshot,
  subscribeFragmentMirror,
  upsertRemoteFragmentSnapshot,
  upsertRemoteFragmentSnapshots,
} from '@/features/fragments/store/localMirror';

export interface FragmentCacheEntry {
  fragment: Fragment;
  cachedAt: string;
}

export interface FragmentListCacheEntry {
  items: Fragment[];
  cachedAt: string;
}

const listMemoryCache = new Map<string, FragmentListCacheEntry | null>();

/*把 folder 维度归一成稳定 scope key，供列表内存镜像复用。 */
function resolveListScopeKey(folderId?: string | null): string {
  const normalizedFolderId = String(folderId ?? '').trim();
  if (!normalizedFolderId || normalizedFolderId === '__all__') {
    return 'all';
  }
  return `folder:${normalizedFolderId}`;
}

/*读取远端详情镜像时优先返回已经预热到内存中的快照。 */
export function peekFragmentCache(fragmentId: string): FragmentCacheEntry | null {
  const fragment = peekRemoteFragmentSnapshot(fragmentId);
  if (!fragment) {
    return null;
  }
  return {
    fragment,
    cachedAt: new Date().toISOString(),
  };
}

/*异步读取本地 SQLite 中的远端详情镜像，并顺手预热内存快照。 */
export async function readFragmentCache(fragmentId: string): Promise<FragmentCacheEntry | null> {
  await ensureFragmentLocalMirrorReady();
  const fragment = await readRemoteFragmentSnapshot(fragmentId);
  if (!fragment) {
    return null;
  }
  return {
    fragment,
    cachedAt: new Date().toISOString(),
  };
}

/*异步读取本地 SQLite 中的远端列表镜像，作为首页和文件夹页真值来源。 */
export async function readFragmentListCache(folderId?: string | null): Promise<FragmentListCacheEntry | null> {
  await ensureFragmentLocalMirrorReady();
  const items = await readRemoteFragmentList(folderId);
  const entry = {
    items,
    cachedAt: new Date().toISOString(),
  };
  listMemoryCache.set(resolveListScopeKey(folderId), entry);
  return entry;
}

/*把单条远端碎片写入本地镜像，并更新所有已读列表的内存快照。 */
export async function writeFragmentCache(fragment: Fragment): Promise<void> {
  await ensureFragmentLocalMirrorReady();
  await upsertRemoteFragmentSnapshot(fragment);
  listMemoryCache.clear();
}

/*把远端列表结果批量写入本地镜像，供后续页面直接查 SQLite。 */
export async function writeFragmentListCache(items: Fragment[], folderId?: string | null): Promise<void> {
  await ensureFragmentLocalMirrorReady();
  await upsertRemoteFragmentSnapshots(items);
  listMemoryCache.set(resolveListScopeKey(folderId), {
    items,
    cachedAt: new Date().toISOString(),
  });
}

/*列表进入详情前只需确保本地镜像已持有该碎片，无需再区分缓存与仓储。 */
export async function prewarmFragmentDetailCache(fragment: Fragment): Promise<void> {
  await ensureFragmentLocalMirrorReady();
  await prewarmRemoteFragmentSnapshot(fragment);
}

/*删除远端镜像并清空内存列表快照，避免首页残留已删卡片。 */
export async function removeFragmentCache(fragmentId: string): Promise<void> {
  await ensureFragmentLocalMirrorReady();
  await removeRemoteFragmentSnapshot(fragmentId);
  listMemoryCache.clear();
}

/*继续保留订阅接口，但底层广播改由本地镜像仓储统一驱动。 */
export function subscribeFragmentCache(listener: () => void): () => void {
  return subscribeFragmentMirror(listener);
}
