import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { runLocalDatabaseMigrations } from '@/features/core/db/migrations';
import { localSchema } from '@/features/core/db/schema';
import { sanitizeWorkspaceId } from '@/features/core/workspaceId';

const DATABASE_PREFIX = 'sparkflow-local';

let databasePromise: Promise<SQLiteDatabase> | null = null;
let drizzlePromise: Promise<ExpoSQLiteDatabase<typeof localSchema> & { $client: SQLiteDatabase }> | null = null;
let currentWorkspaceUserId: string | null = null;

function resolveDatabaseName(): string {
  /*当前本地数据库按 user workspace 分区，未挂载工作区时禁止打开业务库。 */
  if (!currentWorkspaceUserId) {
    throw new Error('当前未挂载登录工作区，无法访问本地数据库');
  }
  return `${DATABASE_PREFIX}-${sanitizeWorkspaceId(currentWorkspaceUserId)}.db`;
}

async function disposeCurrentClient(): Promise<void> {
  /*切换工作区前尽力关闭旧连接，避免继续读写上一个账号的本地库。 */
  if (databasePromise && currentWorkspaceUserId) {
    const client = await databasePromise.catch((err) => {
      console.warn('[DB] 关闭旧连接时获取客户端失败:', err);
      return null;
    });
    await (client as { closeAsync?: () => Promise<void> } | null)?.closeAsync?.();
  }
}

export async function setDatabaseWorkspace(userId: string | null): Promise<void> {
  /*切换当前数据库工作区，并让后续调用重新打开对应用户的 SQLite。 */
  if (currentWorkspaceUserId === userId) {
    return;
  }
  await disposeCurrentClient();
  currentWorkspaceUserId = userId;
  databasePromise = null;
  drizzlePromise = null;
}

export function getDatabaseWorkspaceUserId(): string | null {
  return currentWorkspaceUserId;
}

/*惰性打开 SQLite 连接，并保证迁移只执行一次。 */
export async function getSQLiteClient(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await openDatabaseAsync(resolveDatabaseName());
      await runLocalDatabaseMigrations(database);
      return database;
    })();
  }
  return databasePromise;
}

/*统一返回带 schema 的 Drizzle 实例，供本地镜像查询复用。 */
export async function getLocalDatabase(): Promise<
  ExpoSQLiteDatabase<typeof localSchema> & { $client: SQLiteDatabase }
> {
  if (!drizzlePromise) {
    drizzlePromise = (async () => {
      const client = await getSQLiteClient();
      return drizzle(client, { schema: localSchema });
    })();
  }
  return drizzlePromise;
}

/*让应用启动时可显式预热数据库与迁移过程。 */
export async function ensureLocalDatabaseReady(): Promise<void> {
  await getLocalDatabase();
}
