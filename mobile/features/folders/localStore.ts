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
