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
    body_markdown: '服务端正文',
    media_assets: [],
    ...overrides,
  };
}

test('resolveSessionBaseline prefers local draft over cache and remote', () => {
  const baseline = resolveSessionBaseline({
    fragment: buildFragment({ body_markdown: '远端正文' }),
    draftMarkdown: '本地草稿',
    cachedBodyMarkdown: '缓存正文',
  });

  assert.equal(baseline.snapshot.body_markdown, '本地草稿');
  assert.equal(baseline.remote_baseline, '缓存正文');
  assert.equal(baseline.sync_status, 'idle');
});

test('session hydrates from draft and keeps editor key stable on remote refresh', () => {
  let state = createInitialEditorSessionState('fragment-1');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_markdown: '远端正文' }),
  });
  state = reduceEditorSession(state, {
    type: 'CACHE_LOADED',
    markdown: '缓存正文',
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_DRAFT_LOADED',
    markdown: '本地草稿',
  });

  const initialEditorKey = state.editorKey;
  assert.equal(state.snapshot.body_markdown, '本地草稿');
  assert.equal(state.baseline?.remote_baseline, '缓存正文');

  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_markdown: '新的远端正文' }),
  });

  assert.equal(state.snapshot.body_markdown, '本地草稿');
  assert.equal(state.editorKey, initialEditorKey);
});

test('remote refresh can replace stale snapshot before local edits are confirmed', () => {
  let state = createInitialEditorSessionState('fragment-1');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_markdown: '' }),
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_DRAFT_LOADED',
    markdown: null,
  });

  assert.equal(state.snapshot.body_markdown, '');

  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_markdown: '更完整的远端正文' }),
  });

  assert.equal(state.snapshot.body_markdown, '更完整的远端正文');
});

test('save success advances baseline and clears local edit marker', () => {
  let state = createInitialEditorSessionState('fragment-1');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    fragment: buildFragment({ body_markdown: '服务端正文' }),
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_DRAFT_LOADED',
    markdown: null,
  });
  state = reduceEditorSession(state, {
    type: 'SNAPSHOT_CHANGED',
    snapshot: {
      body_markdown: '修改后的正文',
      plain_text: '修改后的正文',
      asset_ids: [],
    },
  });
  state = reduceEditorSession(state, {
    type: 'SAVE_SUCCEEDED',
    fragment: buildFragment({ body_markdown: '修改后的正文' }),
    savedMarkdown: '修改后的正文',
  });

  assert.equal(state.baseline?.remote_baseline, '修改后的正文');
  assert.equal(state.syncStatus, 'synced');
  assert.equal(state.hasConfirmedLocalEdit, false);
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
      body_markdown: '# 标题',
      plain_text: '标题',
      asset_ids: [],
    },
    imageAsset
  );

  assert.equal(nextSnapshot.body_markdown, '# 标题\n\n![cover.png](asset://asset-1)');
  assert.deepEqual(nextSnapshot.asset_ids, ['asset-1']);
});
