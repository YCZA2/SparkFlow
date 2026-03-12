import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveLocalDraftPersistStatus,
  shouldRestoreLocalDraftOnLaunch,
  shouldTriggerRemoteSync,
} from '../features/fragments/bodySyncPolicy';

function buildFragment(overrides = {}) {
  /*构造最小碎片载荷，聚焦远端同步触发策略。 */
  return {
    id: 'fragment-001',
    source: 'manual',
    created_at: '2026-03-12T10:00:00.000Z',
    body_html: '<p>服务端正文</p>',
    media_assets: [],
    is_local_draft: false,
    remote_id: 'fragment-001',
    local_sync_status: null,
    ...overrides,
  };
}

function buildSnapshot(overrides = {}) {
  /*构造编辑器快照，聚焦正文和素材差异。 */
  return {
    body_html: '<p>服务端正文</p>',
    plain_text: '服务端正文',
    asset_ids: [],
    ...overrides,
  };
}

function buildDraft(overrides = {}) {
  /*构造本地草稿记录，聚焦启动恢复条件。 */
  return {
    local_id: 'local:fragment:001',
    remote_id: null,
    folder_id: null,
    body_html: '<p>本地正文</p>',
    plain_text_snapshot: '本地正文',
    created_at: '2026-03-12T10:00:00.000Z',
    sync_status: 'creating',
    last_sync_attempt_at: null,
    next_retry_at: null,
    retry_count: 0,
    pending_image_assets: [],
    ...overrides,
  };
}

test('shouldTriggerRemoteSync stays quiet for unchanged bound remote fragment', () => {
  assert.equal(
    shouldTriggerRemoteSync({
      fragment: buildFragment() as any,
      snapshot: buildSnapshot() as any,
      mediaAssets: [],
      baselineRemoteHtml: '<p>服务端正文</p>',
      baselineMediaAssets: [],
    }),
    false
  );
});

test('shouldTriggerRemoteSync waits for non-empty local draft before first cloud create', () => {
  assert.equal(
    shouldTriggerRemoteSync({
      fragment: buildFragment({
        id: 'local:fragment:001',
        is_local_draft: true,
        remote_id: null,
        local_sync_status: 'creating',
        body_html: '',
      }) as any,
      snapshot: buildSnapshot({
        body_html: '',
        plain_text: '',
      }) as any,
      mediaAssets: [],
      baselineRemoteHtml: '',
      baselineMediaAssets: [],
    }),
    false
  );

  assert.equal(
    shouldTriggerRemoteSync({
      fragment: buildFragment({
        id: 'local:fragment:001',
        is_local_draft: true,
        remote_id: null,
        local_sync_status: 'creating',
        body_html: '',
      }) as any,
      snapshot: buildSnapshot({
        body_html: '<p>本地正文</p>',
        plain_text: '本地正文',
      }) as any,
      mediaAssets: [],
      baselineRemoteHtml: '',
      baselineMediaAssets: [],
    }),
    true
  );
});

test('resolveLocalDraftPersistStatus keeps synced draft quiet until explicit cloud trigger', () => {
  assert.equal(
    resolveLocalDraftPersistStatus({
      fragment: buildFragment({
        id: 'local:fragment:001',
        is_local_draft: true,
        remote_id: 'fragment-001',
        local_sync_status: 'synced',
      }) as any,
      queueRemote: false,
    }),
    'synced'
  );

  assert.equal(
    resolveLocalDraftPersistStatus({
      fragment: buildFragment({
        id: 'local:fragment:001',
        is_local_draft: true,
        remote_id: 'fragment-001',
        local_sync_status: 'synced',
      }) as any,
      queueRemote: true,
    }),
    'syncing'
  );
});

test('shouldRestoreLocalDraftOnLaunch skips drafts that never entered cloud sync phase', () => {
  assert.equal(shouldRestoreLocalDraftOnLaunch(buildDraft() as any), false);
  assert.equal(
    shouldRestoreLocalDraftOnLaunch(
      buildDraft({
        last_sync_attempt_at: '2026-03-12T10:10:00.000Z',
      }) as any
    ),
    true
  );
  assert.equal(
    shouldRestoreLocalDraftOnLaunch(
      buildDraft({
        sync_status: 'failed_pending_retry',
      }) as any
    ),
    true
  );
});
