import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendImageToSnapshot,
  createInitialEditorSessionState,
  reduceEditorSession,
  resolveEditorSessionBaseline,
} from '../features/editor/sessionState';
import { applyHtmlPatchFallbackToSnapshot } from '../features/editor/sessionHydration';
import type { EditorSourceDocument, EditorMediaAsset } from '../features/editor/types';

function buildDocument(overrides: Partial<EditorSourceDocument> = {}): EditorSourceDocument {
  return {
    id: 'document-1',
    body_html: '服务端正文',
    media_assets: [],
    ...overrides,
  };
}

test('resolveEditorSessionBaseline prefers local draft over cache and remote', () => {
  const baseline = resolveEditorSessionBaseline({
    document: buildDocument({ body_html: '远端正文' }),
    draftHtml: '<p>本地草稿</p>',
    cachedBodyHtml: '<p>缓存正文</p>',
    persistenceMode: 'local-first',
  });

  assert.equal(baseline.snapshot.body_html, '<p>本地草稿</p>');
  assert.equal(baseline.remote_baseline, '<p>缓存正文</p>');
  assert.equal(baseline.sync_status, 'idle');
});

test('shared session keeps local draft snapshot stable across remote refresh', () => {
  let state = createInitialEditorSessionState('document-1', 'local-first');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    document: buildDocument({ body_html: '远端正文' }),
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
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    document: buildDocument({ body_html: '新的远端正文' }),
  });

  assert.equal(state.snapshot.body_html, '<p>本地草稿</p>');
  assert.equal(state.editorKey, initialEditorKey);
});

test('local-first save success keeps session in unsynced state until remote reconciliation', () => {
  let state = createInitialEditorSessionState('local-doc-1', 'local-first');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    document: buildDocument({
      id: 'local-doc-1',
      body_html: '<p>已同步正文</p>',
    }),
  });
  state = reduceEditorSession(state, {
    type: 'CACHE_LOADED',
    html: '<p>已同步正文</p>',
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_DRAFT_LOADED',
    html: '<p>已同步正文</p>',
  });
  state = reduceEditorSession(state, {
    type: 'SNAPSHOT_CHANGED',
    snapshot: {
      body_html: '<p>更新后的正文</p>',
      plain_text: '更新后的正文',
      asset_ids: [],
    },
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_SAVE_SUCCEEDED',
    document: buildDocument({
      id: 'local-doc-1',
      body_html: '<p>更新后的正文</p>',
    }),
    savedHtml: '<p>更新后的正文</p>',
  });

  assert.equal(state.syncStatus, 'unsynced');
  assert.equal(state.baseline?.remote_baseline, '<p>更新后的正文</p>');
});

test('remote-only save success clears local error and marks session synced', () => {
  let state = createInitialEditorSessionState('script-1', 'remote-only');
  state = reduceEditorSession(state, {
    type: 'REMOTE_LOADED',
    document: buildDocument({ id: 'script-1', body_html: '<p>远端正文</p>' }),
  });
  state = reduceEditorSession(state, {
    type: 'LOCAL_DRAFT_LOADED',
    html: null,
  });
  state = reduceEditorSession(state, {
    type: 'CACHE_LOADED',
    html: null,
  });
  state = reduceEditorSession(state, {
    type: 'SNAPSHOT_CHANGED',
    snapshot: {
      body_html: '<p>修改后的正文</p>',
      plain_text: '修改后的正文',
      asset_ids: [],
    },
  });
  state = reduceEditorSession(state, {
    type: 'SAVE_SUCCEEDED',
    document: buildDocument({ id: 'script-1', body_html: '<p>修改后的正文</p>' }),
    savedHtml: '<p>修改后的正文</p>',
  });

  assert.equal(state.syncStatus, 'synced');
  assert.equal(state.errorMessage, null);
  assert.equal(state.source.draft_html, null);
});

test('save failure keeps attempted snapshot and exposes unsynced state', () => {
  let state = createInitialEditorSessionState('script-1', 'remote-only');
  state = reduceEditorSession(state, {
    type: 'SAVE_FAILED',
    attemptedHtml: '<p>失败正文</p>',
    message: '保存失败',
  });

  assert.equal(state.syncStatus, 'unsynced');
  assert.equal(state.snapshot.body_html, '<p>失败正文</p>');
  assert.equal(state.errorMessage, '保存失败');
});

test('applyHtmlPatchFallbackToSnapshot keeps html-derived fields aligned', () => {
  const snapshot = {
    body_html: '<p>原始正文</p>',
    plain_text: '原始正文',
    asset_ids: [],
  };

  const nextSnapshot = applyHtmlPatchFallbackToSnapshot(
    snapshot,
    {
      op: 'prepend_document',
      html_snippet: '<h1>新标题</h1>',
    },
    ''
  );

  assert.equal(nextSnapshot.body_html, '<h1>新标题</h1>\n<p>原始正文</p>');
  assert.equal(nextSnapshot.plain_text, '新标题 原始正文');
  assert.deepEqual(nextSnapshot.asset_ids, []);
});

test('appendImageToSnapshot appends asset html without breaking order', () => {
  const imageAsset: EditorMediaAsset = {
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
