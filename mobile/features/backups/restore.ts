import { assertTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { ensureFragmentStoreReady } from '@/features/fragments/store';

import { createRestoreSession, fetchBackupSnapshot } from './api';
import { buildBackupRestorePlan } from './restoreState';
import { refreshFragmentAudioAccess, refreshBackupMediaAssetUrls, hydrateBackupFileCache } from './restoreCache';
import { applyRestorePlanToLocalState } from './restoreData';

export interface BackupRestoreResult {
  restoreSessionId: string;
  fragmentCount: number;
  folderCount: number;
  mediaAssetCount: number;
  scriptCount: number;
  snapshotGeneratedAt: string;
}

/*用远端备份快照覆盖本地 SQLite 与正文文件，显式完成一次恢复流程。 */
export async function restoreFromBackup(
  reason?: string,
  options?: { scope?: TaskExecutionScope | null }
): Promise<BackupRestoreResult> {
  if (options?.scope) {
    assertTaskScopeActive(options.scope);
  }
  await ensureFragmentStoreReady();

  const restoreSession = await createRestoreSession(reason);
  const snapshot = await fetchBackupSnapshot();
  if (options?.scope) {
    assertTaskScopeActive(options.scope);
  }
  const plan = buildBackupRestorePlan(snapshot);

  // 先刷新 URL、下载媒体缓存，再提交事务——避免事务失败时本地正文文件已被清空
  await refreshFragmentAudioAccess(plan);
  await refreshBackupMediaAssetUrls(plan);
  await hydrateBackupFileCache(plan);
  if (options?.scope) {
    assertTaskScopeActive(options.scope);
  }

  await applyRestorePlanToLocalState(plan, options);

  return {
    restoreSessionId: restoreSession.restore_session_id,
    fragmentCount: plan.fragments.filter((item) => !item.deletedAt).length,
    folderCount: plan.folders.filter((item) => !item.deletedAt).length,
    mediaAssetCount: plan.mediaAssets.filter((item) => !item.deletedAt).length,
    scriptCount: plan.scripts.filter((item) => !item.deletedAt && !item.trashedAt).length,
    snapshotGeneratedAt: snapshot.server_generated_at,
  };
}
