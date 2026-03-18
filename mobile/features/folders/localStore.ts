import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentFoldersTable, fragmentsTable } from '@/features/core/db/schema';
import type { FragmentFolder } from '@/types/folder';

function generateFolderId(): string {
  /*为本地文件夹生成稳定主键，避免依赖远端创建后回填。 */
  return `folder:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

async function countFragmentsByFolder(folderId: string): Promise<number> {
  const database = await getLocalDatabase();
  const rows = await database
    .select({ value: count() })
    .from(fragmentsTable)
    .where(and(eq(fragmentsTable.folderId, folderId), isNull(fragmentsTable.deletedAt)));
  return Number(rows[0]?.value ?? 0);
}

async function mapFolderRow(row: typeof fragmentFoldersTable.$inferSelect): Promise<FragmentFolder> {
  return {
    id: row.id,
    name: row.name,
    fragment_count: await countFragmentsByFolder(row.id),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    backup_status:
      row.backupStatus === 'synced'
        ? 'synced'
        : row.backupStatus === 'failed'
          ? 'failed'
          : 'pending',
    entity_version: row.entityVersion,
    last_backup_at: row.lastBackupAt ?? null,
    deleted_at: row.deletedAt ?? null,
  };
}

export async function listLocalFolders(): Promise<FragmentFolder[]> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentFoldersTable)
    .where(isNull(fragmentFoldersTable.deletedAt))
    .orderBy(desc(fragmentFoldersTable.updatedAt));
  return await Promise.all(rows.map(async (row) => await mapFolderRow(row)));
}

export async function createLocalFolder(name: string, deviceId?: string | null): Promise<FragmentFolder> {
  const database = await getLocalDatabase();
  const now = new Date().toISOString();
  const id = generateFolderId();
  await database.insert(fragmentFoldersTable).values({
    id,
    legacyRemoteId: null,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    legacyCloudBindingStatus: 'pending',
    deletedAt: null,
    backupStatus: 'pending',
    lastBackupAt: null,
    entityVersion: 1,
    lastModifiedDeviceId: deviceId ?? null,
  });
  const rows = await database
    .select()
    .from(fragmentFoldersTable)
    .where(eq(fragmentFoldersTable.id, id))
    .limit(1);
  return await mapFolderRow(rows[0]);
}

/*重命名文件夹：本地先写、递增版本号，由备份队列异步同步远端。 */
export async function updateLocalFolder(
  id: string,
  patch: { name: string },
  deviceId?: string | null
): Promise<FragmentFolder | null> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentFoldersTable)
    .where(eq(fragmentFoldersTable.id, id))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return null;
  }
  const now = new Date().toISOString();
  await database
    .update(fragmentFoldersTable)
    .set({
      name: patch.name.trim(),
      updatedAt: now,
      backupStatus: 'pending',
      entityVersion: current.entityVersion + 1,
      lastModifiedDeviceId: deviceId ?? null,
    })
    .where(eq(fragmentFoldersTable.id, id));
  const updated = await database
    .select()
    .from(fragmentFoldersTable)
    .where(eq(fragmentFoldersTable.id, id))
    .limit(1);
  if (!updated[0]) {
    return null;
  }
  return await mapFolderRow(updated[0]);
}

/*软删除文件夹：设置 deletedAt 并进入备份队列，远端最终也会收到 delete 操作。 */
export async function deleteLocalFolder(
  id: string,
  deviceId?: string | null
): Promise<void> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentFoldersTable)
    .where(eq(fragmentFoldersTable.id, id))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return;
  }
  const now = new Date().toISOString();
  await database
    .update(fragmentFoldersTable)
    .set({
      deletedAt: now,
      updatedAt: now,
      backupStatus: 'pending',
      entityVersion: current.entityVersion + 1,
      lastModifiedDeviceId: deviceId ?? null,
    })
    .where(eq(fragmentFoldersTable.id, id));
}
