import { fetchScriptDetail, fetchScripts } from '@/features/scripts/api';
import { markScriptsStale } from '@/features/scripts/refreshSignal';
import { readLocalScriptEntity, shouldHydrateRemoteScriptEntity, upsertLocalScriptEntity } from '@/features/scripts/store';

/*把远端 scripts 列表灌进本地真值，兼容升级前只存在服务器的历史稿件。 */
export async function syncRemoteScriptsToLocal(): Promise<void> {
  const response = await fetchScripts();
  const items = response.items ?? [];
  if (items.length === 0) {
    return;
  }
  const scriptIdsToHydrate = (
    await Promise.all(
      items.map(async (item) => ((await shouldHydrateRemoteScriptEntity(item.id)) ? item.id : null))
    )
  ).filter((item): item is string => Boolean(item));
  if (scriptIdsToHydrate.length === 0) {
    return;
  }
  const details = await Promise.all(
    scriptIdsToHydrate.map(async (scriptId) => await fetchScriptDetail(scriptId))
  );
  await Promise.all(
    details.map(async (script) => await upsertLocalScriptEntity(script, { backupStatus: 'synced' }))
  );
  markScriptsStale();
}

/*把单条远端 script 详情落成本地真值，供详情页缺本地缓存时回补。 */
export async function syncRemoteScriptDetailToLocal(scriptId: string) {
  if (!(await shouldHydrateRemoteScriptEntity(scriptId))) {
    const localScript = await readLocalScriptEntity(scriptId);
    if (localScript) {
      return localScript;
    }
    throw new Error('本地成稿已存在且禁止被远端旧稿覆盖');
  }
  const detail = await fetchScriptDetail(scriptId);
  const script = await upsertLocalScriptEntity(detail, { backupStatus: 'synced' });
  markScriptsStale();
  return script;
}
