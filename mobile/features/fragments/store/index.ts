export {
  createLocalFragmentEntity,
  deleteLocalFragmentEntity,
  listLocalFragmentEntities,
  markLocalFragmentFilmed,
  readLocalFragmentEntity,
  stageLocalFragmentPendingImage,
  updateLocalFragmentEntity,
} from './localEntityStore';
export { ensureFragmentStoreReady, resetFragmentStoreRuntime } from './runtime';
export { persistBodyHtml, deserializeSpeakerSegments, deserializeTags } from './shared';
export { markFragmentsStale } from '../refreshSignal';

import { clearFragmentQueryCache } from '../queries';

export function clearFragmentStoreCache(): void {
  /*恢复或退出登录后清空 fragment 查询缓存，避免过期数据残留。 */
  clearFragmentQueryCache();
}
