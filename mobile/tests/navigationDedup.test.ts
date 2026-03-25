import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNavigationAttemptRecord,
  shouldBlockNavigationAttempt,
} from '../utils/navigationDedup';

test('shouldBlockNavigationAttempt blocks repeated target within cooldown window', () => {
  const previous = createNavigationAttemptRecord('fragment:1', 1_000);

  assert.equal(shouldBlockNavigationAttempt(previous, 'fragment:1', 1_300, 600), true);
});

test('shouldBlockNavigationAttempt allows repeated target after cooldown window', () => {
  const previous = createNavigationAttemptRecord('fragment:1', 1_000);

  assert.equal(shouldBlockNavigationAttempt(previous, 'fragment:1', 1_700, 600), false);
});

test('shouldBlockNavigationAttempt allows different target inside cooldown window', () => {
  const previous = createNavigationAttemptRecord('fragment:1', 1_000);

  assert.equal(shouldBlockNavigationAttempt(previous, 'script:1', 1_300, 600), false);
});
