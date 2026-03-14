import { and, eq } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import { deleteFileIfExists, getFragmentBodyFile } from '@/features/core/files/runtime';
import { extractPlainTextFromHtml, normalizeBodyHtml } from '@/features/editor/html';
import type { Fragment } from '@/types/fragment';

import {
  buildRemoteFragmentRow,
  loadMediaRowsByFragmentIds,
  mapRemoteRowToFragment,
  persistBodyHtml,
  readFragmentRows,
  replaceRemoteMediaAssets,
} from './shared';
import { useFragmentStore } from './fragmentStore';

/*同步读取最近一次内存中的远端快照，供编辑器 hydrate 与局部预热使用。 */
export function peekRemoteFragmentSnapshot(fragmentId: string): Fragment | null {
  return useFragmentStore.getState().getDetail(fragmentId) ?? null;
}

/*读取 SQLite 中的远端详情镜像，并把它预热进详情内存缓存。 */
export async function readRemoteFragmentSnapshot(fragmentId: string): Promise<Fragment | null> {
  const cached = useFragmentStore.getState().getDetail(fragmentId);
  if (cached) {
    return cached;
  }
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(and(eq(fragmentsTable.id, fragmentId)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const mediaRows = await loadMediaRowsByFragmentIds([fragmentId]);
  const fragment = await mapRemoteRowToFragment(row, mediaRows.get(fragmentId) ?? []);
  useFragmentStore.getState().setDetail(fragmentId, fragment);
  return fragment;
}

/*读取 SQLite 中的远端列表镜像，作为首页与文件夹页的唯一真值来源。 */
export async function readRemoteFragmentList(folderId?: string | null): Promise<Fragment[]> {
  const rows = await readFragmentRows(folderId);
  const mediaRowsByFragmentId = await loadMediaRowsByFragmentIds(rows.map((row) => row.id));
  const fragments = await Promise.all(
    rows.map(async (row) => {
      const fragment = await mapRemoteRowToFragment(row, mediaRowsByFragmentId.get(row.id) ?? []);
      return fragment;
    })
  );
  /*批量更新详情缓存*/
  useFragmentStore.getState().batchUpdateDetails(fragments);
  return fragments;
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
  /*更新 Zustand 详情缓存*/
  useFragmentStore.getState().setDetail(fragment.id, {
    ...fragment,
    body_html: normalizeBodyHtml(fragment.body_html),
    plain_text_snapshot: String(
      fragment.plain_text_snapshot ?? extractPlainTextFromHtml(fragment.body_html)
    ),
  });
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
  /*删除详情缓存并清空列表缓存*/
  useFragmentStore.getState().deleteDetail(fragmentId);
  useFragmentStore.getState().clearCache();
}

/*读取远端列表时顺手更新内存快照，供页面二次进入秒开。 */
export async function readCachedRemoteFragmentList(
  folderId?: string | null
): Promise<{ items: Fragment[]; cachedAt: string } | null> {
  /*优先从 Zustand 缓存读取，避免重复查询 SQLite*/
  const cached = useFragmentStore.getState().getList(folderId ?? null);
  if (cached && cached.length > 0) {
    return { items: cached, cachedAt: new Date().toISOString() };
  }

  /*缓存未命中时从 SQLite 读取*/
  const items = await readRemoteFragmentList(folderId);
  return { items, cachedAt: new Date().toISOString() };
}

/*批量写入远端列表后同步刷新列表级内存镜像。 */
export async function writeCachedRemoteFragmentList(
  items: Fragment[],
  folderId?: string | null
): Promise<void> {
  await upsertRemoteFragmentSnapshots(items);
  /*更新列表缓存*/
  useFragmentStore.getState().setList(folderId ?? null, items);
}

/*把远端详情镜像重新从 SQLite 刷到内存，供编辑器会话比较远端基线。 */
export async function refreshRemoteSnapshotMemory(remoteId: string): Promise<Fragment | null> {
  useFragmentStore.getState().deleteDetail(remoteId);
  return await readRemoteFragmentSnapshot(remoteId);
}

/*读取某条本地草稿绑定的远端快照，供详情页背景刷新与 merge 使用。 */
export async function readBoundRemoteSnapshot(remoteId: string): Promise<Fragment | null> {
  return await readRemoteFragmentSnapshot(remoteId);
}
