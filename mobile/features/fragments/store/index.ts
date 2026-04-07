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

import { useFragmentStore } from './fragmentStore';

export function clearFragmentStoreCache(): void {
  /*恢复或退出登录后清空 fragment 内存缓存，避免过期数据残留。 */
  useFragmentStore.getState().clearCache();
}
