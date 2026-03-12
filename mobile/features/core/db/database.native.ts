import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { runLocalDatabaseMigrations } from '@/features/core/db/migrations';
import { localSchema } from '@/features/core/db/schema';

const DATABASE_NAME = 'sparkflow-local.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;
let drizzlePromise: Promise<ExpoSQLiteDatabase<typeof localSchema> & { $client: SQLiteDatabase }> | null = null;

/*惰性打开 SQLite 连接，并保证迁移只执行一次。 */
export async function getSQLiteClient(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await openDatabaseAsync(DATABASE_NAME);
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
