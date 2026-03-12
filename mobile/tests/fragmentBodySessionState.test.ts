import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendRuntimeMediaAsset,
  applyAiPatchFallbackToSnapshot,
  buildFragmentEditorSnapshot,
  resolveHydratedBodySession,
  shouldProtectSuspiciousEmptySnapshot,
  shouldRehydrateBodySession,
} from '../features/fragments/detail/bodySessionState';
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
    created_at: '2026-03-11T10:00:00.000Z',
    body_html: '服务端正文',
    ...overrides,
  };
}

test('resolveHydratedBodySession prefers local draft and keeps cached baseline', () => {
  const result = resolveHydratedBodySession({
    fragment: buildFragment({ body_html: '服务端正文' }),
    draftHtml: '<p>本地草稿</p>',
    cachedBodyHtml: '<p>缓存正文</p>',
  });

  assert.equal(result.snapshot.body_html, '<p>本地草稿</p>');
  assert.equal(result.remoteBaseline, '<p>缓存正文</p>');
  assert.equal(result.syncStatus, 'idle');
});

test('resolveHydratedBodySession marks synced when no draft overrides remote body', () => {
  const result = resolveHydratedBodySession({
    fragment: buildFragment({ body_html: '服务端正文' }),
    draftHtml: null,
    cachedBodyHtml: null,
  });

  assert.equal(result.snapshot.body_html, '服务端正文');
  assert.equal(result.remoteBaseline, '服务端正文');
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
    currentSnapshot: buildFragmentEditorSnapshot(''),
    remoteBaseline: '',
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
    currentSnapshot: buildFragmentEditorSnapshot('<p>本地草稿</p>'),
    remoteBaseline: '服务端正文',
    visibleMediaAssets: [],
    hasConfirmedLocalEdit: true,
  });

  assert.equal(shouldRehydrate, false);
});

test('shouldProtectSuspiciousEmptySnapshot blocks accidental empty commit without local edits', () => {
  const shouldProtect = shouldProtectSuspiciousEmptySnapshot({
    snapshot: buildFragmentEditorSnapshot(''),
    remoteBaseline: '可信远端正文',
    hasLocalDraft: false,
    hasConfirmedLocalEdit: false,
  });

  assert.equal(shouldProtect, true);
});

test('shouldProtectSuspiciousEmptySnapshot allows intentional empty commit after local edits', () => {
  const shouldProtect = shouldProtectSuspiciousEmptySnapshot({
    snapshot: buildFragmentEditorSnapshot(''),
    remoteBaseline: '可信远端正文',
    hasLocalDraft: false,
    hasConfirmedLocalEdit: true,
  });

  assert.equal(shouldProtect, false);
});

test('applyAiPatchFallbackToSnapshot keeps html-derived snapshot fields aligned', () => {
  const snapshot = buildFragmentEditorSnapshot('<p>原始正文</p>');
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
    once.map((item) => item.id),
    ['asset-1', 'asset-2']
  );
  assert.deepEqual(
    duplicated.map((item) => item.id),
    ['asset-1', 'asset-2']
  );
});
