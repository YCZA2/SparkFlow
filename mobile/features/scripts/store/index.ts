export {
  countLocalScriptEntities,
  createLocalScriptCopy,
  listLocalScriptEntities,
  listLocalScriptsBySourceFragment,
  markLocalScriptFilmed,
  mergeRestoredScriptRow,
  moveLocalScriptToTrash,
  readLocalScriptEntity,
  updateLocalScriptEntity,
  upsertLocalScriptEntity,
} from './localEntityStore';
export { ensureScriptStoreReady, resetScriptStoreRuntime } from './runtime';
export { markScriptsStale } from '../refreshSignal';
export { deserializeSourceFragmentIds } from './shared';

import { clearScriptQueryCache } from '../queries';

export function clearScriptStoreCache(): void {
  /*恢复或退出登录后清空 script 查询缓存，避免过期数据残留。 */
  clearScriptQueryCache();
}
