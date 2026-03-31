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
    created_at_ms: 100,
  });

  assert.deepEqual(peekFragmentCleanupTicket(), {
    fragmentId: 'fragment-1',
    kind: 'empty_manual_placeholder',
    created_at_ms: 100,
  });

  clearFragmentCleanupTicket('fragment-1');
  assert.equal(peekFragmentCleanupTicket(), null);
});

test('fragment cleanup ticket ignores mismatched clear requests', () => {
  clearFragmentCleanupTicket();

  registerFragmentCleanupTicket({
    fragmentId: 'fragment-2',
    kind: 'empty_manual_placeholder',
    created_at_ms: 200,
  });

  clearFragmentCleanupTicket('fragment-other');
  assert.deepEqual(peekFragmentCleanupTicket(), {
    fragmentId: 'fragment-2',
    kind: 'empty_manual_placeholder',
    created_at_ms: 200,
  });

  clearFragmentCleanupTicket('fragment-2');
});

test('fragment cleanup ticket fills created_at_ms when caller omits it', () => {
  clearFragmentCleanupTicket();

  registerFragmentCleanupTicket({
    fragmentId: 'fragment-3',
    kind: 'empty_manual_placeholder',
  });

  const ticket = peekFragmentCleanupTicket();
  assert.equal(ticket?.fragmentId, 'fragment-3');
  assert.equal(ticket?.kind, 'empty_manual_placeholder');
  assert.equal(typeof ticket?.created_at_ms, 'number');

  clearFragmentCleanupTicket('fragment-3');
});
