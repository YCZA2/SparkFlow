import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFragmentSections } from '../features/fragments/fragmentListState';

function buildFragment(createdAt: string, id: string) {
  /*构造最小 fragment 载荷，聚焦列表分组规则。 */
  return {
    id,
    audio_file_url: null,
    transcript: null,
    speaker_segments: null,
    summary: null,
    tags: null,
    source: 'manual',
    created_at: createdAt,
    body_markdown: '',
  } as const;
}

test('buildFragmentSections groups fragments with the same day under one section', () => {
  const now = new Date();
  const morning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0).toISOString();
  const evening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0).toISOString();

  const sections = buildFragmentSections([
    buildFragment(morning, 'fragment-1') as any,
    buildFragment(evening, 'fragment-2') as any,
  ]);

  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.title, '今天');
  assert.deepEqual(
    sections[0]?.data.map((item) => item.id),
    ['fragment-1', 'fragment-2']
  );
});

test('buildFragmentSections separates earlier fragments into distinct labels', () => {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0).toISOString();
  const older = new Date(now.getFullYear() - 1, 5, 1, 12, 0, 0).toISOString();

  const sections = buildFragmentSections([
    buildFragment(yesterday, 'fragment-yesterday') as any,
    buildFragment(older, 'fragment-older') as any,
  ]);

  assert.equal(sections[0]?.title, '昨天');
  assert.match(sections[1]?.title ?? '', /^\d{4}年\d+月\d+日$/);
});
