import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFragmentEntityUpdate } from '../features/fragments/store/updateState';

function buildFragmentRow(overrides: Record<string, unknown> = {}) {
  /*构造最小本地 fragment 行，聚焦更新时间与版本推进规则。 */
  return {
    id: 'fragment-1',
    folderId: null,
    source: 'manual',
    audioSource: null,
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-02T08:00:00.000Z',
    summary: null,
    tagsJson: '[]',
    plainTextSnapshot: '原正文',
    bodyFileUri: '/tmp/fragment-1.html',
    transcript: null,
    speakerSegmentsJson: null,
    audioObjectKey: null,
    audioFileUri: null,
    audioFileUrl: null,
    audioFileExpiresAt: null,
    deletedAt: null,
    isFilmed: 0,
    filmedAt: null,
    backupStatus: 'synced',
    lastBackupAt: '2026-03-02T09:00:00.000Z',
    entityVersion: 3,
    lastModifiedDeviceId: 'device-a',
    contentState: 'body_present',
    cachedAt: '2026-03-02T08:00:00.000Z',
    ...overrides,
  };
}

test('resolveFragmentEntityUpdate keeps updatedAt and entityVersion stable for metadata-only patch', () => {
  const current = buildFragmentRow();

  const result = resolveFragmentEntityUpdate({
    current: current as any,
    patch: {
      backup_status: 'failed',
    },
    plainTextSnapshot: current.plainTextSnapshot,
    bodyFileUri: current.bodyFileUri,
  });

  assert.equal(result.nextRow.updatedAt, current.updatedAt);
  assert.equal(result.nextRow.entityVersion, current.entityVersion);
  assert.equal(result.nextRow.backupStatus, 'failed');
});

test('resolveFragmentEntityUpdate bumps updatedAt and entityVersion after actual body change', () => {
  const current = buildFragmentRow();

  const result = resolveFragmentEntityUpdate({
    current: current as any,
    patch: {
      body_html: '<p>更新后的正文</p>',
      plain_text_snapshot: '更新后的正文',
      last_modified_device_id: 'device-b',
    },
    plainTextSnapshot: '更新后的正文',
    bodyFileUri: current.bodyFileUri,
  });

  assert.notEqual(result.nextRow.updatedAt, current.updatedAt);
  assert.equal(result.nextRow.entityVersion, current.entityVersion + 1);
  assert.equal(result.nextRow.backupStatus, 'pending');
  assert.equal(result.nextRow.lastModifiedDeviceId, 'device-b');
});

test('resolveFragmentEntityUpdate keeps content version stable for media task status change', () => {
  const current = buildFragmentRow();

  const result = resolveFragmentEntityUpdate({
    current: current as any,
    patch: {
      media_task_run_id: 'task-001',
      media_task_status: 'failed',
      media_task_error_message: '语音转写失败',
    },
    plainTextSnapshot: current.plainTextSnapshot,
    bodyFileUri: current.bodyFileUri,
  });

  assert.equal(result.nextRow.updatedAt, current.updatedAt);
  assert.equal(result.nextRow.entityVersion, current.entityVersion);
  assert.equal(result.nextRow.mediaTaskRunId, 'task-001');
  assert.equal(result.nextRow.mediaTaskStatus, 'failed');
  assert.equal(result.nextRow.mediaTaskErrorMessage, '语音转写失败');
});
