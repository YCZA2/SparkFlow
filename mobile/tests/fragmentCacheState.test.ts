import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPendingBodyToFragment,
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

test('applyPendingBodyToFragment prefers pending body over cached html', () => {
  const fragment = buildFragment({
    body_html: '服务端正文',
    plain_text_snapshot: '服务端正文',
  }) as any;

  const nextFragment = applyPendingBodyToFragment(fragment, '<h1>本地待同步正文</h1><p>更新后的正文</p>');

  assert.equal(nextFragment?.body_html, '<h1>本地待同步正文</h1><p>更新后的正文</p>');
  assert.equal(nextFragment?.plain_text_snapshot, '本地待同步正文 更新后的正文');
});
