import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFragmentFromLocalDraft,
  mergeLocalDraftsIntoFragments,
  resolveRetryDelayMs,
} from '../features/fragments/localDraftState';

function buildRemoteFragment(overrides = {}) {
  /*构造最小远端碎片载荷，聚焦本地聚合和去重规则。 */
  return {
    id: 'fragment-001',
    audio_file_url: null,
    transcript: null,
    speaker_segments: null,
    summary: null,
    tags: null,
    source: 'manual',
    created_at: '2026-03-11T10:00:00Z',
    body_html: '远端正文',
    plain_text_snapshot: '远端正文',
    media_assets: [],
    ...overrides,
  };
}

function buildLocalDraft(overrides = {}) {
  /*构造最小本地草稿载荷，聚焦 local-first 列表和详情视图。 */
  return {
    local_id: 'local:fragment:001',
    remote_id: null,
    folder_id: null,
    body_html: '本地正文',
    plain_text_snapshot: '本地正文',
    created_at: '2026-03-11T11:00:00Z',
    sync_status: 'syncing',
    last_sync_attempt_at: null,
    next_retry_at: null,
    retry_count: 0,
    pending_image_assets: [],
    ...overrides,
  };
}

test('buildFragmentFromLocalDraft marks local-first fragment metadata', () => {
  const fragment = buildFragmentFromLocalDraft(buildLocalDraft() as any);

  assert.equal(fragment.id, 'local:fragment:001');
  assert.equal(fragment.local_id, 'local:fragment:001');
  assert.equal(fragment.is_local_draft, true);
  assert.equal(fragment.display_source_label, '本地草稿');
  assert.equal(fragment.local_sync_status, 'syncing');
});

test('mergeLocalDraftsIntoFragments hides remote duplicate after local draft binds remote id', () => {
  const merged = mergeLocalDraftsIntoFragments(
    [
      buildRemoteFragment({ id: 'fragment-001', created_at: '2026-03-11T10:00:00Z' }) as any,
      buildRemoteFragment({ id: 'fragment-002', created_at: '2026-03-11T09:00:00Z' }) as any,
    ],
    [buildLocalDraft({ remote_id: 'fragment-001' }) as any]
  );

  assert.deepEqual(
    merged.map((item) => item.id),
    ['local:fragment:001', 'fragment-002']
  );
});

test('resolveRetryDelayMs applies exponential backoff with cap', () => {
  assert.equal(resolveRetryDelayMs(0), 2000);
  assert.equal(resolveRetryDelayMs(1), 4000);
  assert.equal(resolveRetryDelayMs(5), 60000);
  assert.equal(resolveRetryDelayMs(8), 60000);
});
