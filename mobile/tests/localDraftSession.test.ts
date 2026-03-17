import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isLegacyCloudBindingMissingError,
  resolveLegacyCloudBindingSession,
  shouldIgnoreLegacyCloudDeleteError,
  shouldRecoverLegacyCloudBinding,
} from '../features/fragments/legacyCloudBindingSession';

test('resolveLegacyCloudBindingSession keeps legacy-local mode when fragment has no server_id', () => {
  const result = resolveLegacyCloudBindingSession({
    routeFragmentId: 'fragment-001',
    fragment: {
      id: 'fragment-001',
      server_id: null,
      sync_status: 'pending',
    },
  });

  assert.equal(result.isLegacyLocalFragment, true);
  assert.equal(result.draftId, 'fragment-001');
});

test('resolveLegacyCloudBindingSession uses fragment id when server_id exists', () => {
  const result = resolveLegacyCloudBindingSession({
    routeFragmentId: 'fragment-001',
    fragment: {
      id: 'fragment-001',
      server_id: 'server-001',
      sync_status: 'synced',
    },
  });

  assert.equal(result.isLegacyLocalFragment, false);
  assert.equal(result.draftId, 'fragment-001');
});

test('isLegacyCloudBindingMissingError only accepts NOT_FOUND shaped errors', () => {
  assert.equal(isLegacyCloudBindingMissingError({ code: 'NOT_FOUND' }), true);
  assert.equal(isLegacyCloudBindingMissingError({ code: 'NETWORK_ERROR' }), false);
  assert.equal(isLegacyCloudBindingMissingError(new Error('boom')), false);
});

test('shouldRecoverLegacyCloudBinding allows one-time recovery for stale server binding', () => {
  assert.equal(
    shouldRecoverLegacyCloudBinding({
      error: { code: 'NOT_FOUND' },
      legacyServerBindingId: 'server-001',
      recoveryAttempted: false,
    }),
    true
  );

  assert.equal(
    shouldRecoverLegacyCloudBinding({
      error: { code: 'NOT_FOUND' },
      legacyServerBindingId: 'server-001',
      recoveryAttempted: true,
    }),
    false
  );
});

test('shouldIgnoreLegacyCloudDeleteError only suppresses legacy-local bound server 404', () => {
  assert.equal(
    shouldIgnoreLegacyCloudDeleteError({
      error: { code: 'NOT_FOUND' },
      isLegacyLocalFragment: true,
      legacyServerBindingId: 'server-001',
    }),
    true
  );

  assert.equal(
    shouldIgnoreLegacyCloudDeleteError({
      error: { code: 'NOT_FOUND' },
      isLegacyLocalFragment: false,
      legacyServerBindingId: 'server-001',
    }),
    false
  );

  assert.equal(
    shouldIgnoreLegacyCloudDeleteError({
      error: { code: 'NETWORK_ERROR' },
      isLegacyLocalFragment: true,
      legacyServerBindingId: 'server-001',
    }),
    false
  );
});
