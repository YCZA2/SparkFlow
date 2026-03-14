import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMissingServerBindingError,
  resolveLocalDraftSession,
  shouldIgnoreMissingServerDeleteError,
  shouldRecoverMissingServerBinding,
} from '../features/fragments/localDraftSession';

test('resolveLocalDraftSession keeps local-draft mode when fragment has no server_id', () => {
  const result = resolveLocalDraftSession({
    routeFragmentId: 'fragment-001',
    fragment: {
      id: 'fragment-001',
      server_id: null,
      sync_status: 'pending',
    },
  });

  assert.equal(result.isLocalDraftSession, true);
  assert.equal(result.draftId, 'fragment-001');
});

test('resolveLocalDraftSession uses fragment id when server_id exists', () => {
  const result = resolveLocalDraftSession({
    routeFragmentId: 'fragment-001',
    fragment: {
      id: 'fragment-001',
      server_id: 'server-001',
      sync_status: 'synced',
    },
  });

  assert.equal(result.isLocalDraftSession, false);
  assert.equal(result.draftId, 'fragment-001');
});

test('isMissingServerBindingError only accepts NOT_FOUND shaped errors', () => {
  assert.equal(isMissingServerBindingError({ code: 'NOT_FOUND' }), true);
  assert.equal(isMissingServerBindingError({ code: 'NETWORK_ERROR' }), false);
  assert.equal(isMissingServerBindingError(new Error('boom')), false);
});

test('shouldRecoverMissingServerBinding allows one-time recovery for stale server binding', () => {
  assert.equal(
    shouldRecoverMissingServerBinding({
      error: { code: 'NOT_FOUND' },
      serverId: 'server-001',
      recoveryAttempted: false,
    }),
    true
  );

  assert.equal(
    shouldRecoverMissingServerBinding({
      error: { code: 'NOT_FOUND' },
      serverId: 'server-001',
      recoveryAttempted: true,
    }),
    false
  );
});

test('shouldIgnoreMissingServerDeleteError only suppresses local-draft bound server 404', () => {
  assert.equal(
    shouldIgnoreMissingServerDeleteError({
      error: { code: 'NOT_FOUND' },
      isLocalDraftSession: true,
      serverId: 'server-001',
    }),
    true
  );

  assert.equal(
    shouldIgnoreMissingServerDeleteError({
      error: { code: 'NOT_FOUND' },
      isLocalDraftSession: false,
      serverId: 'server-001',
    }),
    false
  );

  assert.equal(
    shouldIgnoreMissingServerDeleteError({
      error: { code: 'NETWORK_ERROR' },
      isLocalDraftSession: true,
      serverId: 'server-001',
    }),
    false
  );
});
