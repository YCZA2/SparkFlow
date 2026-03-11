import assert from 'node:assert/strict';
import test from 'node:test';

import { createLatestOnlySaveController } from '../features/fragments/detail/fragmentSaveController';

test('createLatestOnlySaveController only persists the latest queued snapshot', async () => {
  const saved: string[] = [];
  let releaseFirst: () => void = () => undefined;
  const firstStarted = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const controller = createLatestOnlySaveController<string>({
    shouldProcess: () => true,
    submit: async (value) => {
      saved.push(value);
      if (value === 'first') {
        await firstStarted;
      }
    },
  });

  const first = controller.submitLatest('first');
  const second = controller.submitLatest('second');
  const third = controller.submitLatest('third');

  releaseFirst();
  await Promise.all([first, second, third]);

  assert.deepEqual(saved, ['first', 'third']);
});

test('createLatestOnlySaveController skips snapshots that no longer need processing', async () => {
  const saved: string[] = [];
  let latestSynced = 'synced';

  const controller = createLatestOnlySaveController<string>({
    shouldProcess: (value) => value !== latestSynced,
    submit: async (value) => {
      saved.push(value);
      latestSynced = value;
    },
  });

  await controller.submitLatest('synced');
  await controller.submitLatest('next');
  await controller.submitLatest('next');

  assert.deepEqual(saved, ['next']);
});
