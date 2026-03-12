import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FRAGMENT_CACHE_TTL_MS,
  applyDraftToFragment,
  mergeFragmentDetailForPrewarm,
  mergeFragmentIntoListItems,
  removeFragmentFromListItems,
  sanitizeFragmentCacheEntry,
  sanitizeFragmentListCacheEntry,
} from '../features/fragments/fragmentCacheState';

function buildFragment(overrides = {}) {
  /*为纯状态测试构造最小 fragment 载荷，聚焦缓存与草稿规则。 */
  return {
    id: 'fragment-001',
    audio_file_url: null,
    transcript: null,
    speaker_segments: null,
    summary: '旧摘要',
    tags: [],
    source: 'manual',
    created_at: '2026-03-11T10:00:00Z',
    body_html: '旧正文',
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
    buildFragment({ id: 'fragment-001', body_html: '旧正文', plain_text_snapshot: '旧正文' }) as any,
    buildFragment({ id: 'fragment-002', body_html: '第二条', plain_text_snapshot: '第二条' }) as any,
  ];

  const merged = mergeFragmentIntoListItems(
    items,
    buildFragment({ id: 'fragment-001', body_html: '新正文', plain_text_snapshot: '新正文' }) as any
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'fragment-001');
  assert.equal(merged[0].plain_text_snapshot, '新正文');
  assert.equal(merged[1].id, 'fragment-002');
});

test('mergeFragmentDetailForPrewarm keeps richer cached body when list snapshot is empty', () => {
  const merged = mergeFragmentDetailForPrewarm(
    buildFragment({
      body_html: '详情正文',
      plain_text_snapshot: '详情正文',
      media_assets: [{ id: 'asset-1' }],
    }) as any,
    buildFragment({
      body_html: '',
      plain_text_snapshot: '',
      media_assets: [],
    }) as any
  );

  assert.equal(merged.body_html, '详情正文');
  assert.equal(merged.plain_text_snapshot, '详情正文');
  assert.deepEqual(merged.media_assets, [{ id: 'asset-1' }]);
});

test('mergeFragmentDetailForPrewarm accepts richer incoming snapshot when it has more body content', () => {
  const merged = mergeFragmentDetailForPrewarm(
    buildFragment({
      body_html: '',
      plain_text_snapshot: '',
      media_assets: [],
    }) as any,
    buildFragment({
      body_html: '列表新正文',
      plain_text_snapshot: '列表新正文',
      media_assets: [],
    }) as any
  );

  assert.equal(merged.body_html, '列表新正文');
  assert.equal(merged.plain_text_snapshot, '列表新正文');
});

test('removeFragmentFromListItems removes deleted fragment from cached list', () => {
  const nextItems = removeFragmentFromListItems(
    [buildFragment({ id: 'fragment-001' }) as any, buildFragment({ id: 'fragment-002' }) as any],
    'fragment-002'
  );

  assert.deepEqual(nextItems.map((item) => item.id), ['fragment-001']);
});

test('applyDraftToFragment prefers unsynced draft over cached server html', () => {
  const fragment = buildFragment({
    body_html: '服务端正文',
    plain_text_snapshot: '服务端正文',
  }) as any;

  const nextFragment = applyDraftToFragment(fragment, '<h1>本地草稿</h1><p>更新后的正文</p>');

  assert.equal(nextFragment?.body_html, '<h1>本地草稿</h1><p>更新后的正文</p>');
  assert.equal(nextFragment?.plain_text_snapshot, '本地草稿 更新后的正文');
});
