export {
  countLocalScriptEntities,
  createLocalScriptCopy,
  listLocalScriptEntities,
  listLocalScriptsBySourceFragment,
  markLocalScriptFilmed,
  mergeRestoredScriptRow,
  moveLocalScriptToTrash,
  readLocalScriptEntity,
  shouldHydrateRemoteScriptEntity,
  updateLocalScriptEntity,
  upsertLocalScriptEntity,
} from './localEntityStore';
export { ensureScriptStoreReady } from './runtime';
export { markScriptsStale } from '../refreshSignal';
export { deserializeSourceFragmentIds } from './shared';

import { useScriptStore } from './scriptStore';

export function clearScriptStoreCache(): void {
  /*恢复或退出登录后清空 script 内存缓存，避免过期数据残留。 */
  useScriptStore.getState().clearCache();
}
