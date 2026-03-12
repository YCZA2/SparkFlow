import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendImageToSnapshot,
  createInitialEditorSessionState,
  reduceEditorSession,
  resolveSessionBaseline,
} from '../features/fragments/detail/editorSessionState';
import type { Fragment, MediaAsset } from '../types/fragment';

function buildFragment(overrides: Partial<Fragment> = {}): Fragment {
  return {
    id: 'fragment-1',
    audio_file_url: null,
    transcript: null,
    speaker_segments: null,
    summary: null,
    tags: null,
    source: 'manual',
    created_at: '2026-03-12T10:00:00.000Z',
    body_html: '服务端正文',
    media_assets: [],
    ...overrides,
  };
}

test('resolveSessionBaseline prefers local draft over cache and remote', () => {
  const baseline = resolveSessionBaseline({
    fragment: buildFragment({ body_html: '远端正文' }),
    draftHtml: '<p>本地草稿</p>',
    cachedBodyHtml: '<p>缓存正文</p>',
  });

  assert.equal(baseline.snapshot.body_html, '<p>本地草稿</p>');
  assert.equal(baseline.remote_baseline, '<p>缓存正文</p>');
  assert.equal(baseline.sync_status, 'idle');
});

test('session hydrates from draft and keeps editor key stable on remote refresh', () => {
  let state = createInitialEditorSessionState('fragment-1');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_html: '远端正文' }),
  });
  state = reduceEditorSession(state, {
    type: 'CACHE_LOADED',
    html: '<p>缓存正文</p>',
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_DRAFT_LOADED',
    html: '<p>本地草稿</p>',
  });

  const initialEditorKey = state.editorKey;
  assert.equal(state.snapshot.body_html, '<p>本地草稿</p>');
  assert.equal(state.baseline?.remote_baseline, '<p>缓存正文</p>');

  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_html: '新的远端正文' }),
  });

  assert.equal(state.snapshot.body_html, '<p>本地草稿</p>');
  assert.equal(state.editorKey, initialEditorKey);
});

test('remote refresh can replace stale snapshot before local edits are confirmed', () => {
  let state = createInitialEditorSessionState('fragment-1');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_html: '' }),
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_DRAFT_LOADED',
    html: null,
  });

  assert.equal(state.snapshot.body_html, '');

  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_html: '更完整的远端正文' }),
  });

  assert.equal(state.snapshot.body_html, '更完整的远端正文');
});

test('save success advances baseline and clears local edit marker', () => {
  let state = createInitialEditorSessionState('fragment-1');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_html: '服务端正文' }),
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_DRAFT_LOADED',
    html: null,
  });
  state = reduceEditorSession(state, {
    type: 'SNAPSHOT_CHANGED',
    snapshot: {
      body_html: '修改后的正文',
      plain_text: '修改后的正文',
      asset_ids: [],
    },
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_SAVE_SUCCEEDED',
    fragment: buildFragment({ body_html: '修改后的正文' }),
    savedHtml: '修改后的正文',
  });

  assert.equal(state.baseline?.remote_baseline, '修改后的正文');
  assert.equal(state.syncStatus, 'unsynced');
  assert.equal(state.hasConfirmedLocalEdit, false);
});

test('no-op snapshot change keeps local draft sync status stable after sync success', () => {
  let state = createInitialEditorSessionState('local:fragment:1');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({
      id: 'local:fragment:1',
      local_id: 'local:fragment:1',
      is_local_draft: true,
      local_sync_status: 'synced',
      body_html: '<p>已同步正文</p>',
    } as Partial<Fragment>),
  });
  state = reduceEditorSession(state, {
    type: 'CACHE_LOADED',
    html: '<p>已同步正文</p>',
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_DRAFT_LOADED',
    html: '<p>已同步正文</p>',
  });

  assert.equal(state.syncStatus, 'synced');

  state = reduceEditorSession(state, {
    type: 'SNAPSHOT_CHANGED',
    snapshot: {
      body_html: '<p>已同步正文</p>',
      plain_text: '已同步正文',
      asset_ids: [],
    },
  });

  assert.equal(state.syncStatus, 'synced');
  assert.equal(state.hasConfirmedLocalEdit, true);
});

test('appendImageToSnapshot appends asset markdown without breaking order', () => {
  const imageAsset: MediaAsset = {
    id: 'asset-1',
    media_kind: 'image',
    original_filename: 'cover.png',
    mime_type: 'image/png',
    file_size: 1,
    checksum: null,
    width: null,
    height: null,
    duration_ms: null,
    status: 'ready',
    created_at: null,
  };

  const nextSnapshot = appendImageToSnapshot(
    {
      body_html: '# 标题',
      plain_text: '标题',
      asset_ids: [],
    },
    imageAsset
  );

  assert.equal(nextSnapshot.body_html, '# 标题<p><img src="asset://asset-1" alt="cover.png" /></p>');
  assert.deepEqual(nextSnapshot.asset_ids, ['asset-1']);
});
