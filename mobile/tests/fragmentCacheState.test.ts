import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FRAGMENT_CACHE_TTL_MS,
  applyDraftToFragment,
  mergeFragmentIntoListItems,
  removeFragmentFromListItems,
  sanitizeFragmentCacheEntry,
  sanitizeFragmentListCacheEntry,
} from '../features/fragments/fragmentCacheState';

function buildFragment(overrides = {}) {
  /** 中文注释：为纯状态测试构造最小 fragment 载荷，聚焦缓存与草稿规则。 */
  return {
    id: 'fragment-001',
    audio_file_url: null,
    transcript: null,
    speaker_segments: null,
    summary: '旧摘要',
    tags: [],
    source: 'manual',
    created_at: '2026-03-11T10:00:00Z',
    body_markdown: '旧正文',
    plain_text_snapshot: '旧正文',
    media_assets: [],
    ...overrides,
  };
}

test('sanitizeFragmentCacheEntry drops expired detail cache', () => {
  const expired = sanitizeFragmentCacheEntry({
    fragment: buildFragment() as any,
    cachedAt: new Date(Date.now() - FRAGMENT_CACHE_TTL_MS - 1000).toISOString(),
  });

  assert.equal(expired, null);
});

test('sanitizeFragmentListCacheEntry keeps fresh list cache', () => {
  const entry = sanitizeFragmentListCacheEntry({
    items: [buildFragment() as any],
    cachedAt: new Date().toISOString(),
  });

  assert.equal(entry?.items.length, 1);
  assert.equal(entry?.items[0].id, 'fragment-001');
});

test('mergeFragmentIntoListItems updates existing fragment preview in place', () => {
  const items = [
    buildFragment({ id: 'fragment-001', body_markdown: '旧正文', plain_text_snapshot: '旧正文' }) as any,
    buildFragment({ id: 'fragment-002', body_markdown: '第二条', plain_text_snapshot: '第二条' }) as any,
  ];

  const merged = mergeFragmentIntoListItems(
    items,
    buildFragment({ id: 'fragment-001', body_markdown: '新正文', plain_text_snapshot: '新正文' }) as any
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'fragment-001');
  assert.equal(merged[0].plain_text_snapshot, '新正文');
  assert.equal(merged[1].id, 'fragment-002');
});

test('removeFragmentFromListItems removes deleted fragment from cached list', () => {
  const nextItems = removeFragmentFromListItems(
    [buildFragment({ id: 'fragment-001' }) as any, buildFragment({ id: 'fragment-002' }) as any],
    'fragment-002'
  );

  assert.deepEqual(nextItems.map((item) => item.id), ['fragment-001']);
});

test('applyDraftToFragment prefers unsynced draft over cached server markdown', () => {
  const fragment = buildFragment({
    body_markdown: '服务端正文',
    plain_text_snapshot: '服务端正文',
  }) as any;

  const nextFragment = applyDraftToFragment(fragment, '# 本地草稿\n\n更新后的正文');

  assert.equal(nextFragment?.body_markdown, '# 本地草稿\n\n更新后的正文');
  assert.equal(nextFragment?.plain_text_snapshot, '本地草稿 更新后的正文');
});
