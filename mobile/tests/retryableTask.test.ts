import assert from 'node:assert/strict';
import test from 'node:test';

import { createRetryableTask } from '../features/core/retryableTask';

test('createRetryableTask retries after the first failure clears cached promise', async () => {
  let attempts = 0;
  const task = createRetryableTask(async () => {
    /*用一次失败一次成功模拟本地 store 首次启动异常后的重试场景。 */
    attempts += 1;
    if (attempts === 1) {
      throw new Error('first failure');
    }
  });

  await assert.rejects(task.run(), /first failure/);
  await assert.doesNotReject(task.run());
  assert.equal(attempts, 2);
});
