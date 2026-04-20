import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTaskRunQueryKey,
  isTaskRunUiPhaseTerminal,
  resolveTaskRunRefetchInterval,
  resolveTaskRunUiPhase,
} from '../features/tasks/taskQueryState';

test('resolveTaskRunUiPhase maps pending and terminal states to unified UI phase', () => {
  assert.equal(resolveTaskRunUiPhase({ enabled: false, isPending: false, status: null }), 'idle');
  assert.equal(resolveTaskRunUiPhase({ enabled: true, isPending: true, status: null }), 'loading');
  assert.equal(resolveTaskRunUiPhase({ enabled: true, isPending: false, status: 'queued' }), 'polling');
  assert.equal(resolveTaskRunUiPhase({ enabled: true, isPending: false, status: 'running' }), 'polling');
  assert.equal(resolveTaskRunUiPhase({ enabled: true, isPending: false, status: 'succeeded' }), 'succeeded');
  assert.equal(resolveTaskRunUiPhase({ enabled: true, isPending: false, status: 'failed' }), 'failed');
  assert.equal(resolveTaskRunUiPhase({ enabled: true, isPending: false, status: 'cancelled' }), 'cancelled');
});

test('resolveTaskRunRefetchInterval stops polling on terminal state or disabled query', () => {
  assert.equal(
    resolveTaskRunRefetchInterval({
      enabled: true,
      intervalMs: 800,
      scopeActive: true,
      task: { status: 'running' },
    }),
    800
  );
  assert.equal(
    resolveTaskRunRefetchInterval({
      enabled: true,
      intervalMs: 800,
      scopeActive: true,
      task: { status: 'succeeded' },
    }),
    false
  );
  assert.equal(
    resolveTaskRunRefetchInterval({
      enabled: false,
      intervalMs: 800,
      scopeActive: true,
      task: { status: 'running' },
    }),
    false
  );
});

test('isTaskRunUiPhaseTerminal only marks unified terminal phases', () => {
  assert.equal(isTaskRunUiPhaseTerminal('idle'), false);
  assert.equal(isTaskRunUiPhaseTerminal('loading'), false);
  assert.equal(isTaskRunUiPhaseTerminal('polling'), false);
  assert.equal(isTaskRunUiPhaseTerminal('succeeded'), true);
  assert.equal(isTaskRunUiPhaseTerminal('failed'), true);
  assert.equal(isTaskRunUiPhaseTerminal('cancelled'), true);
});

test('buildTaskRunQueryKey binds cache to full task execution scope', () => {
  assert.deepEqual(
    buildTaskRunQueryKey('task-001', {
      userId: 'user-001',
      sessionVersion: 7,
      workspaceEpoch: 3,
    }),
    ['task-run', 'user-001', '7', '3', 'task-001']
  );
});

test('buildTaskRunQueryKey separates different sessions and workspaces of the same user', () => {
  assert.notDeepEqual(
    buildTaskRunQueryKey('task-001', {
      userId: 'user-001',
      sessionVersion: 7,
      workspaceEpoch: 3,
    }),
    buildTaskRunQueryKey('task-001', {
      userId: 'user-001',
      sessionVersion: 8,
      workspaceEpoch: 4,
    })
  );
});
