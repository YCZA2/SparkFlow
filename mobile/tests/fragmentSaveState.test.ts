import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDoneAction, resolveSaveOutcome } from '../features/fragments/fragmentSaveState';

test('resolveSaveOutcome marks synced save as clearable draft', () => {
  const outcome = resolveSaveOutcome({
    ok: true,
    savedMarkdown: '服务端最新正文',
    attemptedMarkdown: '本地正文',
  });

  assert.equal(outcome.syncStatus, 'synced');
  assert.equal(outcome.shouldClearDraft, true);
  assert.equal(outcome.lastSyncedMarkdown, '服务端最新正文');
});

test('resolveSaveOutcome keeps unsynced state on save failure', () => {
  const outcome = resolveSaveOutcome({
    ok: false,
    savedMarkdown: '旧正文',
    attemptedMarkdown: '本地未同步正文',
  });

  assert.equal(outcome.syncStatus, 'unsynced');
  assert.equal(outcome.shouldClearDraft, false);
  assert.equal(outcome.lastSyncedMarkdown, '本地未同步正文');
});

test('resolveDoneAction blocks navigation when saveNow fails', () => {
  const result = resolveDoneAction(new Error('network'));

  assert.equal(result.ok, false);
  assert.equal(result.shouldNavigate, false);
  assert.equal(result.message, '内容未同步，已保留本地草稿');
});
