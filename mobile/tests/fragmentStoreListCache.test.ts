import assert from 'node:assert/strict';
import test from 'node:test';

import { useFragmentStore } from '../features/fragments/store/fragmentStore';

function buildFragment(overrides: Record<string, unknown> = {}) {
  /*构造最小 fragment 视图模型，聚焦列表缓存对内容版本变化的感知。 */
  return {
    id: 'fragment-1',
    audio_file_url: null,
    transcript: null,
    speaker_segments: null,
    summary: null,
    tags: [],
    source: 'voice',
    audio_source: 'upload',
    created_at: '2026-03-25T08:00:00.000Z',
    updated_at: '2026-03-25T08:00:00.000Z',
    folder_id: null,
    folder: null,
    body_html: '',
    plain_text_snapshot: '',
    content_state: 'empty',
    media_assets: [],
    ...overrides,
  };
}

test('fragment list cache updates when item content version changes without id change', () => {
  useFragmentStore.getState().clearCache();

  const firstList = [buildFragment()];
  useFragmentStore.getState().setList(null, firstList as any);

  const secondList = [
    buildFragment({
      updated_at: '2026-03-25T08:05:00.000Z',
      plain_text_snapshot: '新的正文标题',
      content_state: 'body_present',
    }),
  ];
  useFragmentStore.getState().setList(null, secondList as any);

  const cached = useFragmentStore.getState().getList(null);
  assert.equal(cached?.[0]?.updated_at, '2026-03-25T08:05:00.000Z');
  assert.equal(cached?.[0]?.plain_text_snapshot, '新的正文标题');
});
