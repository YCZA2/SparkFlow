import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable } from '@/features/core/db/schema';
import { extractPlainTextFromHtml, normalizeBodyHtml } from '@/features/editor/html';
import type { Fragment } from '@/types/fragment';

import {
  buildLegacySnapshotRow,
  persistBodyHtml,
  replaceLegacySnapshotMediaAssets,
} from './shared';
import { useFragmentStore } from './fragmentStore';

/*把旧版云端详情缓存迁入本地镜像，供升级迁移时复用。 */
export async function upsertLegacyRemoteFragmentSnapshot(
  fragment: Fragment,
  cachedAt?: string
): Promise<void> {
  const database = await getLocalDatabase();
  const row = buildLegacySnapshotRow(fragment, cachedAt);
  await persistBodyHtml(fragment.id, fragment.body_html);
  await database
    .insert(fragmentsTable)
    .values(row)
    .onConflictDoUpdate({
      target: fragmentsTable.id,
      set: row,
    });
  await replaceLegacySnapshotMediaAssets(fragment.id, fragment.media_assets);
  useFragmentStore.getState().setDetail(fragment.id, {
    ...fragment,
    body_html: normalizeBodyHtml(fragment.body_html),
    plain_text_snapshot: String(
      fragment.plain_text_snapshot ?? extractPlainTextFromHtml(fragment.body_html)
    ),
  });
}

/*批量写入旧版云端列表缓存，避免升级后丢失可见内容。 */
export async function upsertLegacyRemoteFragmentSnapshots(items: Fragment[]): Promise<void> {
  await Promise.all(items.map(async (item) => await upsertLegacyRemoteFragmentSnapshot(item)));
}

/*读取迁移期缓存中的详情快照，供极少数兼容路径比较基线。 */
export function peekLegacyRemoteFragmentSnapshot(fragmentId: string): Fragment | null {
  return useFragmentStore.getState().getDetail(fragmentId) ?? null;
}
