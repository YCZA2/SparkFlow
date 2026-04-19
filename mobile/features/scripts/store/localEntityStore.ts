import { and, eq, isNull } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { getScriptBodyFile, readScriptBodyFile, writeScriptBodyFile } from '@/features/core/files/runtime';
import { extractPlainTextFromHtml, normalizeBodyHtml } from '@/features/editor/html';
import { scriptsTable } from '@/features/core/db/schema';
import type { Script, ScriptCopyReason } from '@/types/script';

import { useScriptStore } from './scriptStore';
import {
  buildLocalScriptInsertRow,
  buildScriptCopyTitle,
  deserializeSourceFragmentIds,
  generateLocalScriptId,
  mapLocalScriptRowToScript,
  readScriptRows,
  serializeSourceFragmentIds,
  type ScriptRow,
} from './shared';

function buildScriptListCacheKey(sourceFragmentId?: string | null): string | null {
  return sourceFragmentId ? `source:${sourceFragmentId}` : null;
}

/*把远端脚本详情落成本地 script 真值，供生成成功后的详情和列表秒开。 */
export async function upsertLocalScriptEntity(script: Script, options?: { backupStatus?: 'pending' | 'synced' | 'failed' }): Promise<Script> {
  const database = await getLocalDatabase();
  const row = await buildLocalScriptInsertRow(script, {
    backupStatus: options?.backupStatus ?? script.backup_status ?? 'pending',
    entityVersion: script.entity_version ?? 1,
  });
  await database
    .insert(scriptsTable)
    .values(row)
    .onConflictDoUpdate({
      target: scriptsTable.id,
      set: row,
    });
  const next = await readLocalScriptEntity(script.id);
  if (!next) {
    throw new Error('写入本地 script 失败');
  }
  return next;
}

/*分页前的本地脚本列表直接读 SQLite，避免依赖远端详情首屏。 */
export async function listLocalScriptEntities(options?: {
  sourceFragmentId?: string | null;
  includeTrashed?: boolean;
}): Promise<Script[]> {
  const rows = await readScriptRows({
    sourceFragmentId: options?.sourceFragmentId,
    includeTrashed: options?.includeTrashed,
  });
  const scripts = await Promise.all(rows.map(async (row) => await mapLocalScriptRowToScript(row)));
  const cacheKey = buildScriptListCacheKey(options?.sourceFragmentId);
  useScriptStore.getState().setList(cacheKey, scripts);
  useScriptStore.getState().batchUpdateDetails(scripts);
  return scripts;
}

/*读取单条本地 script，缺失时返回 null。 */
export async function readLocalScriptEntity(scriptId: string): Promise<Script | null> {
  const cached = useScriptStore.getState().getDetail(scriptId);
  if (cached) {
    return cached;
  }
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(scriptsTable)
    .where(and(eq(scriptsTable.id, scriptId), isNull(scriptsTable.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const script = await mapLocalScriptRowToScript(row);
  useScriptStore.getState().setDetail(scriptId, script);
  return script;
}

/*按 local-first 语义更新 script 真值，并统一推进备份队列状态。 */
export async function updateLocalScriptEntity(
  id: string,
  patch: Partial<Script> & {
    backup_status?: Script['backup_status'];
    entity_version?: number;
    last_backup_at?: string | null;
    last_modified_device_id?: string | null;
    trashed_at?: string | null;
    deleted_at?: string | null;
  }
): Promise<Script | null> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, id))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return null;
  }

  const nextUpdatedAt = patch.updated_at ?? new Date().toISOString();
  let bodyFileUri = current.bodyFileUri;
  let plainTextSnapshot = patch.plain_text_snapshot ?? current.plainTextSnapshot;
  if (typeof patch.body_html === 'string') {
    const normalizedBody = normalizeBodyHtml(patch.body_html);
    await writeScriptBodyFile(id, normalizedBody);
    bodyFileUri = getScriptBodyFile(id).uri;
    plainTextSnapshot = patch.plain_text_snapshot ?? extractPlainTextFromHtml(normalizedBody);
  }

  await database
    .update(scriptsTable)
    .set({
      title: patch.title === undefined ? current.title : patch.title,
      mode: patch.mode === undefined ? current.mode : patch.mode,
      generationKind: patch.generation_kind === undefined ? current.generationKind : patch.generation_kind,
      sourceFragmentIdsJson:
        patch.source_fragment_ids === undefined
          ? current.sourceFragmentIdsJson
          : serializeSourceFragmentIds(patch.source_fragment_ids),
      isDailyPush: patch.is_daily_push === undefined ? current.isDailyPush : patch.is_daily_push ? 1 : 0,
      createdAt: patch.created_at === undefined ? current.createdAt : patch.created_at ?? current.createdAt,
      updatedAt: nextUpdatedAt,
      generatedAt: patch.generated_at === undefined ? current.generatedAt : patch.generated_at ?? current.generatedAt,
      plainTextSnapshot,
      bodyFileUri,
      isFilmed: patch.is_filmed === undefined ? current.isFilmed : patch.is_filmed ? 1 : 0,
      filmedAt: patch.filmed_at === undefined ? current.filmedAt : patch.filmed_at,
      copyOfScriptId: patch.copy_of_script_id === undefined ? current.copyOfScriptId : patch.copy_of_script_id,
      copyReason: patch.copy_reason === undefined ? current.copyReason : patch.copy_reason,
      trashedAt: patch.trashed_at === undefined ? current.trashedAt : patch.trashed_at,
      deletedAt: patch.deleted_at === undefined ? current.deletedAt : patch.deleted_at,
      backupStatus: patch.backup_status ?? 'pending',
      lastBackupAt: patch.last_backup_at ?? current.lastBackupAt,
      entityVersion: patch.entity_version ?? (current.entityVersion + 1),
      lastModifiedDeviceId: patch.last_modified_device_id ?? current.lastModifiedDeviceId,
      cachedAt: nextUpdatedAt,
    })
    .where(eq(scriptsTable.id, id));

  useScriptStore.getState().deleteDetail(id);
  useScriptStore.getState().deleteList(null);
  return await readLocalScriptEntity(id);
}

/*为恢复冲突或手动另存为副本创建新的本地 script。 */
export async function createLocalScriptCopy(
  script: Script,
  reason: ScriptCopyReason,
  options?: { bodyHtml?: string | null; lastModifiedDeviceId?: string | null }
): Promise<Script> {
  const copyId = generateLocalScriptId();
  const database = await getLocalDatabase();
  const row = await buildLocalScriptInsertRow(
    {
      ...script,
      id: copyId,
      title: buildScriptCopyTitle(script.title, reason),
      copy_of_script_id: script.id,
      copy_reason: reason,
    },
    {
      id: copyId,
      bodyHtml: options?.bodyHtml ?? script.body_html ?? '',
      copyOfScriptId: script.id,
      copyReason: reason,
      backupStatus: 'pending',
      entityVersion: 1,
      lastModifiedDeviceId: options?.lastModifiedDeviceId ?? null,
    }
  );
  await database.insert(scriptsTable).values(row);
  const next = await readLocalScriptEntity(copyId);
  if (!next) {
    throw new Error('创建本地 script 副本失败');
  }
  return next;
}

/*把成稿移入回收站，先保留本地可恢复能力，再交给同步层决定是否彻底删除。 */
export async function moveLocalScriptToTrash(id: string, options?: { deviceId?: string | null }): Promise<Script | null> {
  return await updateLocalScriptEntity(id, {
    trashed_at: new Date().toISOString(),
    backup_status: 'pending',
    last_modified_device_id: options?.deviceId ?? null,
  });
}

/*将本地 script 标记为已拍，和 fragment 一起进入统一内容消费语义。 */
export async function markLocalScriptFilmed(id: string, options?: { filmedAt?: string; deviceId?: string | null }): Promise<Script | null> {
  const filmedAt = options?.filmedAt ?? new Date().toISOString();
  return await updateLocalScriptEntity(id, {
    is_filmed: true,
    filmed_at: filmedAt,
    backup_status: 'pending',
    last_modified_device_id: options?.deviceId ?? null,
  });
}

/*统计当前活跃 script 数量，供首页系统文件夹入口判断是否展示。 */
export async function countLocalScriptEntities(): Promise<number> {
  const rows = await readScriptRows();
  return rows.length;
}

/*按来源碎片查找衍生成稿，供 fragment 详情在更多菜单里展示下游关系。 */
export async function listLocalScriptsBySourceFragment(fragmentId: string): Promise<Script[]> {
  return await listLocalScriptEntities({ sourceFragmentId: fragmentId });
}

/*恢复脚本快照时按“现存本地 > 远端快照 > 回收站”合并成稿资产。 */
export async function mergeRestoredScriptRow(input: {
  row: ScriptRow;
  bodyHtml: string;
  lastModifiedDeviceId?: string | null;
}): Promise<Script | null> {
  const database = await getLocalDatabase();
  const existingRows = await database.select().from(scriptsTable).where(eq(scriptsTable.id, input.row.id)).limit(1);
  const existing = existingRows[0];

  if (!existing) {
    if (!input.row.deletedAt) {
      await writeScriptBodyFile(input.row.id, input.bodyHtml);
    }
    await database.insert(scriptsTable).values({
      ...input.row,
      bodyFileUri: input.row.deletedAt ? null : getScriptBodyFile(input.row.id).uri,
      plainTextSnapshot: extractPlainTextFromHtml(input.bodyHtml),
    });
    return await readLocalScriptEntity(input.row.id);
  }

  if (!existing.trashedAt && !existing.deletedAt) {
    if (input.row.deletedAt) {
      return await readLocalScriptEntity(existing.id);
    }
    const sourceFragmentIds = deserializeSourceFragmentIds(input.row.sourceFragmentIdsJson);
    const remoteScript: Script = {
      id: input.row.id,
      title: input.row.title ?? null,
      body_html: input.bodyHtml,
      plain_text_snapshot: input.row.plainTextSnapshot || extractPlainTextFromHtml(input.bodyHtml),
      mode: input.row.mode as Script['mode'],
      source_fragment_ids: sourceFragmentIds,
      source_fragment_count: sourceFragmentIds.length,
      status: input.row.isFilmed === 1 ? 'filmed' : 'draft',
      is_daily_push: input.row.isDailyPush === 1,
      created_at: input.row.createdAt,
      updated_at: input.row.updatedAt,
      generated_at: input.row.generatedAt,
      generation_kind: input.row.generationKind as Script['generation_kind'],
      is_filmed: input.row.isFilmed === 1,
      filmed_at: input.row.filmedAt ?? null,
      trashed_at: input.row.trashedAt ?? null,
      deleted_at: input.row.deletedAt ?? null,
      copy_of_script_id: input.row.copyOfScriptId ?? null,
      copy_reason: (input.row.copyReason as Script['copy_reason']) ?? null,
      backup_status: input.row.backupStatus as Script['backup_status'],
      entity_version: input.row.entityVersion,
      last_backup_at: input.row.lastBackupAt ?? null,
      last_modified_device_id: input.row.lastModifiedDeviceId ?? null,
    };
    return await createLocalScriptCopy(remoteScript, 'restore', {
      bodyHtml: input.bodyHtml,
      lastModifiedDeviceId: input.lastModifiedDeviceId ?? null,
    });
  }

  if (!input.row.deletedAt) {
    await writeScriptBodyFile(input.row.id, input.bodyHtml);
  }
  await database
    .update(scriptsTable)
    .set({
      ...input.row,
      plainTextSnapshot: extractPlainTextFromHtml(input.bodyHtml),
      bodyFileUri: input.row.deletedAt ? null : getScriptBodyFile(input.row.id).uri,
      trashedAt: null,
      deletedAt: input.row.deletedAt,
    })
    .where(eq(scriptsTable.id, input.row.id));
  return await readLocalScriptEntity(input.row.id);
}
