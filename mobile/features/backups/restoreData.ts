import type { TaskExecutionScope } from '@/features/auth/taskScope';
import { assertTaskScopeActive } from '@/features/auth/taskScope';
import { fragmentFoldersTable, fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import { getLocalDatabase } from '@/features/core/db/database';
import {
  cleanupStaleFragmentDirectories,
  getFragmentBodyFile,
  getScriptBodyFile,
} from '@/features/core/files/runtime';
import {
  clearFragmentStoreCache,
  markFragmentsStale,
  persistBodyHtml,
} from '@/features/fragments/store';
import {
  clearScriptStoreCache,
  markScriptsStale,
  mergeRestoredScriptRow,
} from '@/features/scripts/store';

import type { BackupRestorePlan } from './restoreState';

async function mergeRestoredScripts(plan: BackupRestorePlan): Promise<void> {
  /*script 恢复按"现存本地 > 远端快照 > 回收站"规则合并，不粗暴覆盖本地稿。 */
  for (const script of plan.scripts) {
    const bodyHtml = script.deletedAt ? '' : script.bodyHtml;
    await mergeRestoredScriptRow({
      row: {
        id: script.id,
        title: script.title,
        mode: script.mode,
        generationKind: script.generationKind,
        sourceFragmentIdsJson: script.sourceFragmentIdsJson,
        isDailyPush: script.isDailyPush,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt,
        generatedAt: script.generatedAt,
        plainTextSnapshot: script.plainTextSnapshot,
        bodyFileUri: script.deletedAt ? null : getScriptBodyFile(script.id).uri,
        isFilmed: script.isFilmed,
        filmedAt: script.filmedAt,
        copyOfScriptId: script.copyOfScriptId,
        copyReason: script.copyReason,
        trashedAt: script.trashedAt,
        deletedAt: script.deletedAt,
        backupStatus: script.backupStatus,
        lastBackupAt: script.lastBackupAt,
        entityVersion: script.entityVersion,
        lastModifiedDeviceId: script.lastModifiedDeviceId,
        cachedAt: script.cachedAt,
      },
      bodyHtml,
      lastModifiedDeviceId: script.lastModifiedDeviceId,
    });
  }
}

export async function commitRestoreTransaction(plan: BackupRestorePlan): Promise<void> {
  /*用事务原子替换本地数据：DELETE 和 INSERT 要么全成功，要么全回滚，避免崩溃后数据为空。 */
  const database = await getLocalDatabase();
  await database.transaction(async (tx) => {
    await tx.delete(mediaAssetsTable);
    await tx.delete(fragmentsTable);
    await tx.delete(fragmentFoldersTable);

    if (plan.folders.length > 0) {
      await tx.insert(fragmentFoldersTable).values(plan.folders);
    }

    if (plan.fragments.length > 0) {
      await tx.insert(fragmentsTable).values(
        plan.fragments.map((fragment) => ({
          id: fragment.id,
          folderId: fragment.folderId,
          source: fragment.source,
          audioSource: fragment.audioSource,
          createdAt: fragment.createdAt,
          updatedAt: fragment.updatedAt,
          summary: fragment.summary,
          tagsJson: fragment.tagsJson,
          plainTextSnapshot: fragment.plainTextSnapshot,
          bodyFileUri: fragment.deletedAt ? null : getFragmentBodyFile(fragment.id).uri,
          transcript: fragment.transcript,
          speakerSegmentsJson: fragment.speakerSegmentsJson,
          audioObjectKey: fragment.audioObjectKey,
          audioFileUri: fragment.audioFileUri,
          audioFileUrl: fragment.audioFileUrl,
          audioFileExpiresAt: fragment.audioFileExpiresAt,
          deletedAt: fragment.deletedAt,
          isFilmed: fragment.isFilmed,
          filmedAt: fragment.filmedAt,
          backupStatus: fragment.backupStatus,
          lastBackupAt: fragment.lastBackupAt,
          entityVersion: fragment.entityVersion,
          lastModifiedDeviceId: fragment.lastModifiedDeviceId,
          contentState: fragment.contentState,
          cachedAt: fragment.cachedAt,
        }))
      );
    }

    if (plan.mediaAssets.length > 0) {
      await tx.insert(mediaAssetsTable).values(plan.mediaAssets);
    }
  });
}

export async function writeRestoredFragmentBodyFiles(
  plan: BackupRestorePlan,
  options?: { scope?: TaskExecutionScope | null }
): Promise<void> {
  /*事务提交后再写正文文件：SQLite 行已存在，文件写失败只影响正文展示，不会导致数据行丢失。 */
  for (const fragment of plan.fragments) {
    if (fragment.deletedAt || !fragment.bodyHtml.trim()) {
      continue;
    }
    if (options?.scope) {
      assertTaskScopeActive(options.scope);
    }
    await persistBodyHtml(fragment.id, fragment.bodyHtml);
  }

  // 正文文件写完后再清理不再需要的 fragment 目录，确保清理前本地数据已经完整落盘。
  const liveFragmentIds = new Set(
    plan.fragments.filter((f) => !f.deletedAt).map((f) => f.id)
  );
  await cleanupStaleFragmentDirectories(liveFragmentIds);
}

export async function applyRestorePlanToLocalState(
  plan: BackupRestorePlan,
  options?: { scope?: TaskExecutionScope | null }
): Promise<void> {
  /*按顺序提交事务、写正文文件、合并 script、清空缓存并发出刷新信号。 */
  await commitRestoreTransaction(plan);
  await writeRestoredFragmentBodyFiles(plan, options);

  if (options?.scope) {
    assertTaskScopeActive(options.scope);
  }
  await mergeRestoredScripts(plan);

  clearFragmentStoreCache();
  clearScriptStoreCache();
  markFragmentsStale();
  markScriptsStale();
}
