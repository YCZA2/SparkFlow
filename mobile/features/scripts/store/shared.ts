import { desc } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { getScriptBodyFile, readScriptBodyFile, writeScriptBodyFile } from '@/features/core/files/runtime';
import { extractPlainTextFromHtml, normalizeBodyHtml } from '@/features/editor/html';
import { scriptsTable } from '@/features/core/db/schema';
import type { Script, ScriptCopyReason, ScriptGenerationKind, ScriptMode, ScriptStatus } from '@/types/script';
export { shouldSkipRemoteScriptHydration, type LocalScriptHydrationGuardInput } from './hydrationGuard';

export type ScriptRow = typeof scriptsTable.$inferSelect;

/*为恢复冲突副本生成稳定的本地主键。 */
export function generateLocalScriptId(): string {
  return `script:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/*把来源碎片 ID 统一序列化为 JSON 文本，便于 SQLite 持久化。 */
export function serializeSourceFragmentIds(sourceFragmentIds: string[] | null | undefined): string {
  return JSON.stringify((sourceFragmentIds ?? []).filter((item) => typeof item === 'string' && item.trim()));
}

/*从 SQLite 记录中恢复来源碎片 ID 列表，避免异常值污染 lineage。 */
export function deserializeSourceFragmentIds(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

/*统一生成副本标题后缀，让冲突与恢复副本在列表里可直观看见。 */
export function buildScriptCopyTitle(title: string | null | undefined, reason: ScriptCopyReason): string {
  const baseTitle = String(title || '').trim() || '未命名成稿';
  if (reason === 'restore') {
    return `${baseTitle}（恢复副本）`;
  }
  if (reason === 'conflict') {
    return `${baseTitle}（本地冲突副本）`;
  }
  return `${baseTitle}（副本）`;
}

/*把是否已拍转换为当前兼容脚本接口仍需暴露的 status。 */
export function resolveScriptStatus(isFilmed: boolean): ScriptStatus {
  return isFilmed ? 'filmed' : 'draft';
}

/*按本地脚本行与正文文件组装成稿展示模型。 */
export async function mapLocalScriptRowToScript(row: ScriptRow): Promise<Script> {
  const bodyHtml = normalizeBodyHtml(await readScriptBodyFile(row.id));
  const sourceFragmentIds = deserializeSourceFragmentIds(row.sourceFragmentIdsJson);
  return {
    id: row.id,
    title: row.title ?? null,
    body_html: bodyHtml,
    plain_text_snapshot: row.plainTextSnapshot || extractPlainTextFromHtml(bodyHtml),
    mode: row.mode as ScriptMode,
    source_fragment_ids: sourceFragmentIds,
    source_fragment_count: sourceFragmentIds.length,
    status: resolveScriptStatus(row.isFilmed === 1),
    is_daily_push: row.isDailyPush === 1,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    generated_at: row.generatedAt,
    generation_kind: row.generationKind as ScriptGenerationKind,
    is_filmed: row.isFilmed === 1,
    filmed_at: row.filmedAt ?? null,
    trashed_at: row.trashedAt ?? null,
    deleted_at: row.deletedAt ?? null,
    copy_of_script_id: row.copyOfScriptId ?? null,
    copy_reason: (row.copyReason as ScriptCopyReason | null) ?? null,
    backup_status:
      row.backupStatus === 'synced'
        ? 'synced'
        : row.backupStatus === 'failed'
          ? 'failed'
          : 'pending',
    entity_version: row.entityVersion,
    last_backup_at: row.lastBackupAt ?? null,
    last_modified_device_id: row.lastModifiedDeviceId ?? null,
  };
}

/*把远端脚本详情规整成可直接写入本地 SQLite 的 insert 结构。 */
export async function buildLocalScriptInsertRow(
  script: Script,
  options?: {
    bodyHtml?: string | null;
    copyOfScriptId?: string | null;
    copyReason?: ScriptCopyReason | null;
    id?: string;
    trashedAt?: string | null;
    deletedAt?: string | null;
    entityVersion?: number;
    backupStatus?: 'pending' | 'synced' | 'failed';
    lastBackupAt?: string | null;
    lastModifiedDeviceId?: string | null;
    generatedAt?: string | null;
  }
): Promise<typeof scriptsTable.$inferInsert> {
  const now = new Date().toISOString();
  const bodyHtml = normalizeBodyHtml(options?.bodyHtml ?? script.body_html ?? '');
  await writeScriptBodyFile(options?.id ?? script.id, bodyHtml);
  return {
    id: options?.id ?? script.id,
    title: script.title ?? null,
    mode: script.mode,
    generationKind: script.generation_kind ?? (script.is_daily_push ? 'daily_push' : 'manual'),
    sourceFragmentIdsJson: serializeSourceFragmentIds(script.source_fragment_ids),
    isDailyPush: script.is_daily_push ? 1 : 0,
    createdAt: script.created_at ?? now,
    updatedAt: script.updated_at ?? script.created_at ?? now,
    generatedAt: options?.generatedAt ?? script.generated_at ?? script.created_at ?? now,
    plainTextSnapshot: script.plain_text_snapshot ?? extractPlainTextFromHtml(bodyHtml),
    bodyFileUri: getScriptBodyFile(options?.id ?? script.id).uri,
    isFilmed: script.is_filmed || script.status === 'filmed' ? 1 : 0,
    filmedAt: script.filmed_at ?? null,
    copyOfScriptId: options?.copyOfScriptId ?? script.copy_of_script_id ?? null,
    copyReason: options?.copyReason ?? script.copy_reason ?? null,
    trashedAt: options?.trashedAt ?? script.trashed_at ?? null,
    deletedAt: options?.deletedAt ?? script.deleted_at ?? null,
    backupStatus: options?.backupStatus ?? script.backup_status ?? 'pending',
    lastBackupAt: options?.lastBackupAt ?? script.last_backup_at ?? null,
    entityVersion: options?.entityVersion ?? script.entity_version ?? 1,
    lastModifiedDeviceId: options?.lastModifiedDeviceId ?? script.last_modified_device_id ?? null,
    cachedAt: now,
  };
}

/*读取当前本地已存在的 script 行，便于冲突恢复与列表同步复用。 */
export async function readScriptRows(options?: {
  sourceFragmentId?: string | null;
  includeTrashed?: boolean;
  includeDeleted?: boolean;
}): Promise<ScriptRow[]> {
  const database = await getLocalDatabase();
  const rows = await database.select().from(scriptsTable).orderBy(desc(scriptsTable.generatedAt), desc(scriptsTable.updatedAt));
  return rows.filter((row) => {
    if (!options?.includeDeleted && row.deletedAt) {
      return false;
    }
    if (!options?.includeTrashed && row.trashedAt) {
      return false;
    }
    if (options?.sourceFragmentId && !deserializeSourceFragmentIds(row.sourceFragmentIdsJson).includes(options.sourceFragmentId)) {
      return false;
    }
    return true;
  });
}
