import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTaskRecoveryKey,
  createTaskRecoveryRegistry,
} from '../features/tasks/taskRecoveryRegistry';

test('buildTaskRecoveryKey binds recovery observers to task kind and full scope', () => {
  assert.equal(
    buildTaskRecoveryKey('media', 'task-001', {
      userId: 'user-001',
      sessionVersion: 5,
      workspaceEpoch: 2,
    }),
    'media:user-001:5:2:task-001'
  );
});

test('buildTaskRecoveryKey separates same task id across kinds or session scopes', () => {
  assert.notEqual(
    buildTaskRecoveryKey('media', 'task-001', {
      userId: 'user-001',
      sessionVersion: 5,
      workspaceEpoch: 2,
    }),
    buildTaskRecoveryKey('script', 'task-001', {
      userId: 'user-001',
      sessionVersion: 5,
      workspaceEpoch: 2,
    })
  );

  assert.notEqual(
    buildTaskRecoveryKey('script', 'task-001', {
      userId: 'user-001',
      sessionVersion: 5,
      workspaceEpoch: 2,
    }),
    buildTaskRecoveryKey('script', 'task-001', {
      userId: 'user-001',
      sessionVersion: 6,
      workspaceEpoch: 3,
    })
  );
});

test('createTaskRecoveryRegistry deduplicates active observers and allows retry after finish', () => {
  const registry = createTaskRecoveryRegistry();
  const key = 'media:user-001:5:2:task-001';

  assert.equal(registry.begin(key), true);
  assert.equal(registry.has(key), true);
  assert.equal(registry.begin(key), false);

  registry.finish(key);

  assert.equal(registry.has(key), false);
  assert.equal(registry.begin(key), true);
});
