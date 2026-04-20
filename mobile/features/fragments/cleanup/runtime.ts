import { getOrCreateDeviceId } from '@/features/auth/device';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { deleteLocalFragmentEntity, readLocalFragmentEntity } from '@/features/fragments/store';
import type { Fragment } from '@/types/fragment';

import { clearFragmentCleanupTicket, peekFragmentCleanupTicket } from './cleanupTicket';
import { resolveFragmentCleanup, type FragmentCleanupResolution } from './consumerState';

interface FragmentCleanupRuntimeOptions {
  readVisibleFragments?: () => Promise<Pick<Fragment, 'id'>[]>;
  shouldCancel?: () => boolean;
  onDeleteStart?: (
    fragmentId: string,
    resolution: Extract<FragmentCleanupResolution, { action: 'delete' }>
  ) => Promise<void> | void;
  onDeleteComplete?: (fragmentId: string) => Promise<void> | void;
  onDeleteSettled?: (fragmentId: string) => Promise<void> | void;
}

/*等待 ticket 缓冲期结束后再重新判断，降低异步保存与自动清理的竞态。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/*统一消费待清理 ticket；列表页通过可选回调接入可见性检查和退场动画。 */
export async function consumePendingFragmentCleanup(
  options: FragmentCleanupRuntimeOptions = {}
): Promise<boolean> {
  while (true) {
    const ticket = peekFragmentCleanupTicket();
    if (!ticket) {
      return false;
    }

    const [fragment, visibleFragments] = await Promise.all([
      readLocalFragmentEntity(ticket.fragmentId),
      options.readVisibleFragments?.(),
    ]);
    if (options.shouldCancel?.()) {
      return false;
    }

    const resolution = resolveFragmentCleanup(ticket, fragment, { visibleFragments });

    if (resolution.action === 'skip') {
      return false;
    }

    if (resolution.action === 'defer') {
      await sleep(resolution.delay_ms);
      continue;
    }

    if (resolution.action === 'clear') {
      clearFragmentCleanupTicket(resolution.fragmentId);
      return false;
    }

    try {
      await options.onDeleteStart?.(resolution.fragmentId, resolution);
      if (options.shouldCancel?.()) {
        return false;
      }

      const deviceId = await getOrCreateDeviceId();
      await deleteLocalFragmentEntity(resolution.fragmentId, { deviceId });
      clearFragmentCleanupTicket(resolution.fragmentId);
      markFragmentsStale();
      await options.onDeleteComplete?.(resolution.fragmentId);
      return true;
    } finally {
      await options.onDeleteSettled?.(resolution.fragmentId);
    }
  }
}
