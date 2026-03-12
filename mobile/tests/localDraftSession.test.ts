import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMissingRemoteBindingError,
  resolveLocalDraftSession,
  shouldIgnoreMissingRemoteDeleteError,
  shouldRecoverMissingRemoteBinding,
} from '../features/fragments/localDraftSession';

test('resolveLocalDraftSession keeps local-draft mode when route id is local even if fragment is remote-shaped', () => {
  const result = resolveLocalDraftSession({
    routeFragmentId: 'local:fragment:001',
    fragment: {
      id: 'fragment-001',
      local_id: null,
      is_local_draft: false,
    },
  });

  assert.equal(result.isLocalDraftSession, true);
  assert.equal(result.localDraftId, 'local:fragment:001');
});

test('resolveLocalDraftSession falls back to fragment local_id when route id is remote', () => {
  const result = resolveLocalDraftSession({
    routeFragmentId: 'fragment-001',
    fragment: {
      id: 'fragment-001',
      local_id: 'local:fragment:001',
      is_local_draft: true,
    },
  });

  assert.equal(result.isLocalDraftSession, true);
  assert.equal(result.localDraftId, 'local:fragment:001');
});

test('isMissingRemoteBindingError only accepts NOT_FOUND shaped errors', () => {
  assert.equal(isMissingRemoteBindingError({ code: 'NOT_FOUND' }), true);
  assert.equal(isMissingRemoteBindingError({ code: 'NETWORK_ERROR' }), false);
  assert.equal(isMissingRemoteBindingError(new Error('boom')), false);
});

test('shouldRecoverMissingRemoteBinding allows one-time recovery for stale remote binding', () => {
  assert.equal(
    shouldRecoverMissingRemoteBinding({
      error: { code: 'NOT_FOUND' },
      remoteId: 'fragment-001',
      recoveryAttempted: false,
    }),
    true
  );

  assert.equal(
    shouldRecoverMissingRemoteBinding({
      error: { code: 'NOT_FOUND' },
      remoteId: 'fragment-001',
      recoveryAttempted: true,
    }),
    false
  );
});

test('shouldIgnoreMissingRemoteDeleteError only suppresses local-draft bound remote 404', () => {
  assert.equal(
    shouldIgnoreMissingRemoteDeleteError({
      error: { code: 'NOT_FOUND' },
      isLocalDraftSession: true,
      remoteId: 'fragment-001',
    }),
    true
  );

  assert.equal(
    shouldIgnoreMissingRemoteDeleteError({
      error: { code: 'NOT_FOUND' },
      isLocalDraftSession: false,
      remoteId: 'fragment-001',
    }),
    false
  );

  assert.equal(
    shouldIgnoreMissingRemoteDeleteError({
      error: { code: 'NETWORK_ERROR' },
      isLocalDraftSession: true,
      remoteId: 'fragment-001',
    }),
    false
  );
});
