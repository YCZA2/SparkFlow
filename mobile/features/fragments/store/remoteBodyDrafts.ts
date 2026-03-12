import { eq } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable } from '@/features/core/db/schema';
import {
  clearFragmentDraftBodyFile,
  listFragmentDraftBodyIds,
  readFragmentDraftBodyFile,
  writeFragmentDraftBodyFile,
} from '@/features/core/files/runtime';
import { normalizeBodyHtml } from '@/features/editor/html';

/*把远端碎片正文草稿写入文件层，供后台同步与离页恢复复用。 */
export async function saveRemoteBodyDraft(fragmentId: string, html: string): Promise<void> {
  const normalizedHtml = normalizeBodyHtml(html);
  await writeFragmentDraftBodyFile(fragmentId, normalizedHtml);
  const database = await getLocalDatabase();
  await database
    .update(fragmentsTable)
    .set({
      syncStatus: normalizedHtml ? 'unsynced' : 'synced',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fragmentsTable.id, fragmentId));
  /*Zustand 自动响应式，无需手动触发*/
}

/*读取远端碎片的本地正文草稿，统一从文件层恢复未同步输入。 */
export async function loadRemoteBodyDraft(fragmentId: string): Promise<string | null> {
  return await readFragmentDraftBodyFile(fragmentId);
}

/*当远端正文同步成功后清理草稿文件，让基线重新回到远端镜像。 */
export async function clearRemoteBodyDraft(fragmentId: string): Promise<void> {
  await clearFragmentDraftBodyFile(fragmentId);
  const database = await getLocalDatabase();
  await database
    .update(fragmentsTable)
    .set({
      syncStatus: 'synced',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fragmentsTable.id, fragmentId));
  /*Zustand 自动响应式，无需手动触发*/
}

/*枚举仍存在未同步正文草稿的远端碎片 id。 */
export async function listRemoteBodyDraftIds(): Promise<string[]> {
  return await listFragmentDraftBodyIds();
}

