import { getOrCreateDeviceId } from '@/features/auth/device';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { deleteLocalFragmentEntity, readLocalFragmentEntity } from '@/features/fragments/store';

import { clearFragmentCleanupTicket, peekFragmentCleanupTicket } from './cleanupTicket';
import { resolveFragmentCleanupDirect } from './consumerState';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/*在非碎片列表页直接消费待清理 ticket，避免首页或录音页残留空占位。 */
export async function consumePendingFragmentCleanupDirectly(): Promise<boolean> {
  while (true) {
    const ticket = peekFragmentCleanupTicket();
    if (!ticket) {
      return false;
    }

    const fragment = await readLocalFragmentEntity(ticket.fragmentId);
    const resolution = resolveFragmentCleanupDirect(ticket, fragment);

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

    const deviceId = await getOrCreateDeviceId();
    await deleteLocalFragmentEntity(resolution.fragmentId, { deviceId });
    clearFragmentCleanupTicket(resolution.fragmentId);
    markFragmentsStale();
    return true;
  }
}
