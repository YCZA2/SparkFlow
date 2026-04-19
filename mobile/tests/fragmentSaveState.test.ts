import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDoneAction, resolveSaveOutcome } from '../features/fragments/fragmentSaveState';

test('resolveSaveOutcome marks synced save as clearable pending body', () => {
  const outcome = resolveSaveOutcome({
    ok: true,
    savedHtml: '<p>服务端最新正文</p>',
    attemptedHtml: '<p>本地正文</p>',
  });

  assert.equal(outcome.syncStatus, 'synced');
  assert.equal(outcome.shouldClearPendingBody, true);
  assert.equal(outcome.lastSyncedHtml, '<p>服务端最新正文</p>');
});

test('resolveSaveOutcome keeps unsynced state on save failure', () => {
  const outcome = resolveSaveOutcome({
    ok: false,
    savedHtml: '<p>旧正文</p>',
    attemptedHtml: '<p>本地未同步正文</p>',
  });

  assert.equal(outcome.syncStatus, 'unsynced');
  assert.equal(outcome.shouldClearPendingBody, false);
  assert.equal(outcome.lastSyncedHtml, '<p>本地未同步正文</p>');
});

test('resolveDoneAction blocks navigation when saveNow fails', () => {
  const result = resolveDoneAction(new Error('network'));

  assert.equal(result.ok, false);
  assert.equal(result.shouldNavigate, false);
  assert.equal(result.message, '内容未同步，已保留本地待同步正文');
});
