import { and, eq } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import { deleteFileIfExists, getFragmentBodyFile } from '@/features/core/files/runtime';
import { extractPlainTextFromHtml, normalizeBodyHtml } from '@/features/editor/html';
import type { Fragment } from '@/types/fragment';

import {
  buildRemoteFragmentRow,
  detailMemoryCache,
  emitFragmentStoreChange,
  fragmentStoreListeners,
  loadMediaRowsByFragmentIds,
  mapRemoteRowToFragment,
  persistBodyHtml,
  readFragmentRows,
  replaceRemoteMediaAssets,
} from './shared';

const listMemoryCache = new Map<string, { items: Fragment[]; cachedAt: string } | null>();

/*把 folder 维度归一成稳定 scope key，供列表内存镜像复用。 */
function resolveListScopeKey(folderId?: string | null): string {
  const normalizedFolderId = String(folderId ?? '').trim();
  if (!normalizedFolderId || normalizedFolderId === '__all__') {
    return 'all';
  }
  return `folder:${normalizedFolderId}`;
}

/*订阅 fragment store 变化，让列表和详情继续复用最小广播模型。 */
export function subscribeFragmentStore(listener: () => void): () => void {
  fragmentStoreListeners.add(listener);
  return () => {
    fragmentStoreListeners.delete(listener);
  };
}

/*同步读取最近一次内存中的远端快照，供编辑器 hydrate 与局部预热使用。 */
export function peekRemoteFragmentSnapshot(fragmentId: string): Fragment | null {
  return detailMemoryCache.get(fragmentId) ?? null;
}

/*读取 SQLite 中的远端详情镜像，并把它预热进详情内存缓存。 */
export async function readRemoteFragmentSnapshot(fragmentId: string): Promise<Fragment | null> {
  const cached = detailMemoryCache.get(fragmentId);
  if (cached) {
    return cached;
  }
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(and(eq(fragmentsTable.id, fragmentId), eq(fragmentsTable.isLocalDraft, 0)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const mediaRows = await loadMediaRowsByFragmentIds([fragmentId]);
  const fragment = await mapRemoteRowToFragment(row, mediaRows.get(fragmentId) ?? []);
  detailMemoryCache.set(fragmentId, fragment);
  return fragment;
}

/*读取 SQLite 中的远端列表镜像，作为首页与文件夹页的唯一真值来源。 */
export async function readRemoteFragmentList(folderId?: string | null): Promise<Fragment[]> {
  const rows = await readFragmentRows(folderId, false);
  const mediaRowsByFragmentId = await loadMediaRowsByFragmentIds(rows.map((row) => row.id));
  return await Promise.all(
    rows.map(async (row) => {
      const fragment = await mapRemoteRowToFragment(row, mediaRowsByFragmentId.get(row.id) ?? []);
      detailMemoryCache.set(row.id, fragment);
      return fragment;
    })
  );
}

/*把单条远端碎片持久化到本地镜像，并更新详情内存快照。 */
export async function upsertRemoteFragmentSnapshot(
  fragment: Fragment,
  cachedAt?: string
): Promise<void> {
  const database = await getLocalDatabase();
  const row = buildRemoteFragmentRow(fragment, cachedAt);
  await persistBodyHtml(fragment.id, fragment.body_html);
  await database
    .insert(fragmentsTable)
    .values(row)
    .onConflictDoUpdate({
      target: fragmentsTable.id,
      set: row,
    });
  await replaceRemoteMediaAssets(fragment.id, fragment.media_assets);
  detailMemoryCache.set(fragment.id, {
    ...fragment,
    body_html: normalizeBodyHtml(fragment.body_html),
    plain_text_snapshot: String(
      fragment.plain_text_snapshot ?? extractPlainTextFromHtml(fragment.body_html)
    ),
  });
  emitFragmentStoreChange();
}

/*批量持久化远端列表结果，供首页和文件夹页直接读取 SQLite。 */
export async function upsertRemoteFragmentSnapshots(items: Fragment[]): Promise<void> {
  await Promise.all(items.map(async (item) => await upsertRemoteFragmentSnapshot(item)));
}

/*预热详情页所需的远端碎片镜像，避免点击后还要等远端接口。 */
export async function prewarmRemoteFragmentSnapshot(fragment: Fragment): Promise<void> {
  await upsertRemoteFragmentSnapshot(fragment);
}

/*从本地镜像移除远端碎片，供删除成功后立即回收列表和详情。 */
export async function removeRemoteFragmentSnapshot(fragmentId: string): Promise<void> {
  const database = await getLocalDatabase();
  await database.delete(mediaAssetsTable).where(eq(mediaAssetsTable.fragmentId, fragmentId));
  await database.delete(fragmentsTable).where(eq(fragmentsTable.id, fragmentId));
  await deleteFileIfExists(getFragmentBodyFile(fragmentId));
  detailMemoryCache.delete(fragmentId);
  listMemoryCache.clear();
  emitFragmentStoreChange();
}

/*读取远端列表时顺手更新内存快照，供页面二次进入秒开。 */
export async function readCachedRemoteFragmentList(
  folderId?: string | null
): Promise<{ items: Fragment[]; cachedAt: string } | null> {
  const items = await readRemoteFragmentList(folderId);
  const entry = { items, cachedAt: new Date().toISOString() };
  listMemoryCache.set(resolveListScopeKey(folderId), entry);
  return entry;
}

/*批量写入远端列表后同步刷新列表级内存镜像。 */
export async function writeCachedRemoteFragmentList(
  items: Fragment[],
  folderId?: string | null
): Promise<void> {
  await upsertRemoteFragmentSnapshots(items);
  listMemoryCache.set(resolveListScopeKey(folderId), {
    items,
    cachedAt: new Date().toISOString(),
  });
}

/*把远端详情镜像重新从 SQLite 刷到内存，供编辑器会话比较远端基线。 */
export async function refreshRemoteSnapshotMemory(remoteId: string): Promise<Fragment | null> {
  detailMemoryCache.delete(remoteId);
  return await readRemoteFragmentSnapshot(remoteId);
}

/*读取某条本地草稿绑定的远端快照，供详情页背景刷新与 merge 使用。 */
export async function readBoundRemoteSnapshot(remoteId: string): Promise<Fragment | null> {
  return await readRemoteFragmentSnapshot(remoteId);
}
