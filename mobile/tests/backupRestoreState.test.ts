import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBackupRestorePlan } from '../features/backups/restoreState';

test('buildBackupRestorePlan converts snapshot items into local restore rows', () => {
  const plan = buildBackupRestorePlan({
    server_generated_at: '2026-03-17T10:00:00Z',
    items: [
      {
        entity_type: 'folder',
        entity_id: 'folder-1',
        entity_version: 2,
        operation: 'upsert',
        payload: {
          name: '播客灵感',
          created_at: '2026-03-16T10:00:00Z',
          updated_at: '2026-03-17T09:00:00Z',
        },
        modified_at: '2026-03-17T09:00:00Z',
        last_modified_device_id: 'device-a',
      },
      {
        entity_type: 'fragment',
        entity_id: 'fragment-1',
        entity_version: 3,
        operation: 'upsert',
        payload: {
          folder_id: 'folder-1',
          source: 'voice',
          audio_source: 'upload',
          audio_object_key: 'audio/original/test-user-001/fragment-1/demo.m4a',
          created_at: '2026-03-16T11:00:00Z',
          updated_at: '2026-03-17T09:30:00Z',
          body_html: '<p>正文</p>',
          plain_text_snapshot: '正文',
          transcript: '转写',
          summary: '摘要',
          tags: ['口播'],
          content_state: 'body_present',
        },
        modified_at: '2026-03-17T09:30:00Z',
        last_modified_device_id: 'device-a',
      },
      {
        entity_type: 'media_asset',
        entity_id: 'asset-1',
        entity_version: 1,
        operation: 'upsert',
        payload: {
          fragment_id: 'fragment-1',
          media_kind: 'image',
          mime_type: 'image/png',
          file_name: 'cover.png',
          backup_object_key: 'backups/assets/demo.png',
          backup_file_url: 'https://example.com/cover.png',
          file_size: 1024,
          created_at: '2026-03-17T09:31:00Z',
        },
        modified_at: '2026-03-17T09:31:00Z',
        last_modified_device_id: 'device-a',
      },
    ],
  });

  assert.equal(plan.folders[0]?.name, '播客灵感');
  assert.equal(plan.fragments[0]?.source, 'voice');
  assert.equal(plan.fragments[0]?.audioObjectKey, 'audio/original/test-user-001/fragment-1/demo.m4a');
  assert.equal(plan.fragments[0]?.bodyHtml, '<p>正文</p>');
  assert.equal(plan.fragments[0]?.plainTextSnapshot, '正文');
  assert.equal(plan.mediaAssets[0]?.remoteFileUrl, 'https://example.com/cover.png');
  assert.equal(plan.mediaAssets[0]?.remoteAssetId, 'backups/assets/demo.png');
});

test('buildBackupRestorePlan preserves delete tombstones with fallback values', () => {
  const plan = buildBackupRestorePlan({
    server_generated_at: '2026-03-17T10:00:00Z',
    items: [
      {
        entity_type: 'fragment',
        entity_id: 'fragment-deleted',
        entity_version: 5,
        operation: 'delete',
        payload: null,
        modified_at: '2026-03-17T08:00:00Z',
        last_modified_device_id: 'device-b',
      },
    ],
  });

  assert.equal(plan.fragments[0]?.deletedAt, '2026-03-17T08:00:00Z');
  assert.equal(plan.fragments[0]?.source, 'manual');
  assert.equal(plan.fragments[0]?.bodyHtml, '');
  assert.equal(plan.fragments[0]?.backupStatus, 'synced');
});
