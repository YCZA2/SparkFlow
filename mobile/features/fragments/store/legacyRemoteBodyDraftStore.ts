import { eq } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable } from '@/features/core/db/schema';
import { writeFragmentDraftBodyFile } from '@/features/core/files/runtime';
import { normalizeBodyHtml } from '@/features/editor/html';

/*把旧版远端正文草稿迁入文件层，供升级后恢复未同步输入。 */
export async function saveLegacyRemoteBodyDraft(
  fragmentId: string,
  html: string
): Promise<void> {
  const normalizedHtml = normalizeBodyHtml(html);
  await writeFragmentDraftBodyFile(fragmentId, normalizedHtml);
  const database = await getLocalDatabase();
  await database
    .update(fragmentsTable)
    .set({
      legacyCloudBindingStatus: normalizedHtml ? 'unsynced' : 'synced',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fragmentsTable.id, fragmentId));
}
