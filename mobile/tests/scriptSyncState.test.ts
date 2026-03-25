import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldSkipRemoteScriptHydration } from '../features/scripts/store/hydrationGuard';

test('script sync skips remote hydration when local row already exists', () => {
  assert.equal(
    shouldSkipRemoteScriptHydration({
      hasLocalRow: true,
      backupStatus: 'synced',
      hasBodyFile: false,
    }),
    true
  );
});

test('script sync skips remote hydration when local backup is pending', () => {
  assert.equal(
    shouldSkipRemoteScriptHydration({
      hasLocalRow: false,
      backupStatus: 'pending',
      hasBodyFile: false,
    }),
    true
  );
});

test('script sync skips remote hydration when only local body file remains', () => {
  assert.equal(
    shouldSkipRemoteScriptHydration({
      hasLocalRow: false,
      backupStatus: null,
      hasBodyFile: true,
    }),
    true
  );
});

test('script sync allows remote hydration only when local truth is absent', () => {
  assert.equal(
    shouldSkipRemoteScriptHydration({
      hasLocalRow: false,
      backupStatus: 'synced',
      hasBodyFile: false,
    }),
    false
  );
});
