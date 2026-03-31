import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearFragmentCleanupTicket,
  peekFragmentCleanupTicket,
  registerFragmentCleanupTicket,
} from '../features/fragments/cleanup/cleanupTicket';

test('fragment cleanup ticket can be registered and consumed once', () => {
  clearFragmentCleanupTicket();

  registerFragmentCleanupTicket({
    fragmentId: 'fragment-1',
    kind: 'empty_manual_placeholder',
  });

  assert.deepEqual(peekFragmentCleanupTicket(), {
    fragmentId: 'fragment-1',
    kind: 'empty_manual_placeholder',
  });

  clearFragmentCleanupTicket('fragment-1');
  assert.equal(peekFragmentCleanupTicket(), null);
});

test('fragment cleanup ticket ignores mismatched clear requests', () => {
  clearFragmentCleanupTicket();

  registerFragmentCleanupTicket({
    fragmentId: 'fragment-2',
    kind: 'empty_manual_placeholder',
  });

  clearFragmentCleanupTicket('fragment-other');
  assert.deepEqual(peekFragmentCleanupTicket(), {
    fragmentId: 'fragment-2',
    kind: 'empty_manual_placeholder',
  });

  clearFragmentCleanupTicket('fragment-2');
});
