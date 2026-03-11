import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampFontSize,
  clampSpeed,
  isTapAfterPan,
  shouldStartPan,
  togglePauseState,
} from '../features/recording/teleprompterState';

test('clampFontSize limits values', () => {
  assert.equal(clampFontSize(10), 20);
  assert.equal(clampFontSize(28), 28);
  assert.equal(clampFontSize(48), 40);
});

test('clampSpeed limits and rounds values', () => {
  assert.equal(clampSpeed(0.2), 0.5);
  assert.equal(clampSpeed(1.27), 1.3);
  assert.equal(clampSpeed(5), 3);
});

test('togglePauseState flips pause state', () => {
  assert.equal(togglePauseState(true), false);
  assert.equal(togglePauseState(false), true);
});

test('gesture helpers model pause-resume drag rules', () => {
  assert.equal(shouldStartPan(true, 6), true);
  assert.equal(shouldStartPan(false, 8), false);
  assert.equal(isTapAfterPan(false, 0), true);
  assert.equal(isTapAfterPan(true, 1), false);
});

test('gesture helpers respect threshold boundaries', () => {
  assert.equal(shouldStartPan(true, 5), false);
  assert.equal(shouldStartPan(true, -6), true);
  assert.equal(isTapAfterPan(false, 5), false);
  assert.equal(isTapAfterPan(false, -4), true);
});
