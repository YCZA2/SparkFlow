import { assertTaskScopeActive, type TaskExecutionScope } from '@/features/auth/taskScope';
import { fetchScriptDetail } from '@/features/scripts/api';
import { markScriptsStale } from '@/features/scripts/refreshSignal';
import { readLocalScriptEntity, upsertLocalScriptEntity } from '@/features/scripts/store';

/*脚本生成任务成功后，把后端生成详情落成本地真值。 */
export async function hydrateGeneratedScriptToLocal(
  scriptId: string,
  options?: { scope?: TaskExecutionScope | null }
) {
  // 先读本地，有真值直接返回，避免生成恢复场景重复写入。
  const localScript = await readLocalScriptEntity(scriptId);
  if (localScript) {
    return localScript;
  }
  const detail = await fetchScriptDetail(scriptId);
  if (options?.scope) {
    assertTaskScopeActive(options.scope);
  }
  const script = await upsertLocalScriptEntity(detail, { backupStatus: 'synced' });
  markScriptsStale();
  return script;
}
