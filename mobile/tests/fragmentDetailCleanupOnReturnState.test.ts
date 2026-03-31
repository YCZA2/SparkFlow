import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveFragmentDetailCleanupOnReturn,
} from '../features/fragments/detail/cleanupOnReturn';

test('resolveFragmentDetailCleanupOnReturn defaults to manual empty cleanup', () => {
  assert.equal(resolveFragmentDetailCleanupOnReturn(undefined), 'empty_manual_placeholder');
});

test('resolveFragmentDetailCleanupOnReturn preserves explicit disable', () => {
  assert.equal(resolveFragmentDetailCleanupOnReturn(null), null);
});

test('resolveFragmentDetailCleanupOnReturn preserves explicit cleanup mode', () => {
  assert.equal(
    resolveFragmentDetailCleanupOnReturn('empty_manual_placeholder'),
    'empty_manual_placeholder'
  );
});
