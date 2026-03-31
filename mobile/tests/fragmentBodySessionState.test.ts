import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendRuntimeMediaAsset,
  applyAiPatchFallbackToSnapshot,
  resolveHydratedBodySession,
  shouldProtectSuspiciousEmptySnapshot,
  shouldRehydrateBodySession,
} from '../features/fragments/detail/bodySessionState';
import { buildEditorDocumentSnapshot } from '../features/editor/sessionState';
import type { Fragment, MediaAsset } from '../types/fragment';

function buildFragment(overrides: Partial<Fragment> = {}): Fragment {
  return {
    id: 'fragment-1',
    audio_file_url: null,
    transcript: null,
    speaker_segments: null,
    summary: null,
    tags: null,
    source: 'voice',
    audio_source: 'upload',
    created_at: '2026-03-25T00:00:00.000Z',
    updated_at: '2026-03-25T00:00:00.000Z',
    folder_id: null,
    folder: null,
    body_html: '',
    plain_text_snapshot: null,
    content_state: 'empty',
    media_assets: [],
    ...overrides,
  };
}

test('resolveHydratedBodySession prefers local draft and keeps baseline', () => {
  const result = resolveHydratedBodySession({
    fragment: buildFragment({ body_html: '服务端正文' }),
    draftHtml: '<p>本地草稿</p>',
    baselineContentHtml: '<p>基线正文</p>',
  });

  assert.equal(result.snapshot.body_html, '<p>本地草稿</p>');
  assert.equal(result.baselineBodyHtml, '<p>基线正文</p>');
  assert.equal(result.syncStatus, 'idle');
});

test('resolveHydratedBodySession marks synced when no draft overrides remote body', () => {
  const result = resolveHydratedBodySession({
    fragment: buildFragment({ body_html: '服务端正文' }),
    draftHtml: null,
    baselineContentHtml: null,
  });

  assert.equal(result.snapshot.body_html, '服务端正文');
  assert.equal(result.baselineBodyHtml, '服务端正文');
  assert.equal(result.syncStatus, 'synced');
});

test('shouldRehydrateBodySession allows remote detail to replace stale empty snapshot', () => {
  const shouldRehydrate = shouldRehydrateBodySession({
    fragment: buildFragment({
      body_html: '远端正文',
      plain_text_snapshot: '远端正文',
      media_assets: [],
    }),
    draftHtml: null,
    currentSnapshot: buildEditorDocumentSnapshot(''),
    baselineBodyHtml: '',
    visibleMediaAssets: [],
    hasConfirmedLocalEdit: false,
  });

  assert.equal(shouldRehydrate, true);
});

test('shouldRehydrateBodySession blocks remote reset when local draft exists', () => {
  const shouldRehydrate = shouldRehydrateBodySession({
    fragment: buildFragment({
      body_html: '远端正文',
      plain_text_snapshot: '远端正文',
      media_assets: [],
    }),
    draftHtml: '<p>本地草稿</p>',
    currentSnapshot: buildEditorDocumentSnapshot('<p>本地草稿</p>'),
    baselineBodyHtml: '服务端正文',
    visibleMediaAssets: [],
    hasConfirmedLocalEdit: true,
  });

  assert.equal(shouldRehydrate, false);
});

test('shouldProtectSuspiciousEmptySnapshot blocks accidental empty commit without local edits', () => {
  const shouldProtect = shouldProtectSuspiciousEmptySnapshot({
    snapshot: buildEditorDocumentSnapshot(''),
    baselineBodyHtml: '可信远端正文',
    hasLocalDraft: false,
    hasConfirmedLocalEdit: false,
  });

  assert.equal(shouldProtect, true);
});

test('shouldProtectSuspiciousEmptySnapshot allows intentional empty commit after local edits', () => {
  const shouldProtect = shouldProtectSuspiciousEmptySnapshot({
    snapshot: buildEditorDocumentSnapshot(''),
    baselineBodyHtml: '可信远端正文',
    hasLocalDraft: false,
    hasConfirmedLocalEdit: true,
  });

  assert.equal(shouldProtect, false);
});

test('applyAiPatchFallbackToSnapshot keeps html-derived snapshot fields aligned', () => {
  const snapshot = buildEditorDocumentSnapshot('<p>原始正文</p>');
  const nextSnapshot = applyAiPatchFallbackToSnapshot(
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

test('appendRuntimeMediaAsset deduplicates uploaded assets and keeps insertion order', () => {
  const firstAsset: MediaAsset = {
    id: 'asset-1',
    media_kind: 'image',
    original_filename: '1.png',
    mime_type: 'image/png',
    file_size: 1,
    checksum: null,
    width: null,
    height: null,
    duration_ms: null,
    status: 'ready',
    created_at: null,
  };
  const secondAsset: MediaAsset = {
    ...firstAsset,
    id: 'asset-2',
    original_filename: '2.png',
  };

  const once = appendRuntimeMediaAsset([firstAsset], secondAsset);
  const duplicated = appendRuntimeMediaAsset(once, secondAsset);

  assert.deepEqual(
    once.map((item: MediaAsset) => item.id),
    ['asset-1', 'asset-2']
  );
  assert.deepEqual(
    duplicated.map((item: MediaAsset) => item.id),
    ['asset-1', 'asset-2']
  );
});
