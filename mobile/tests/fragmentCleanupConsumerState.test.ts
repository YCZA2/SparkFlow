import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFragmentCleanup } from '../features/fragments/cleanup/consumerState';
import type { Fragment } from '../types/fragment';

function buildFragment(overrides: Partial<Fragment> = {}): Fragment {
  /*构造 cleanup 相关最小 fragment，聚焦返回页消费决策。 */
  return {
    id: 'fragment-1',
    audio_file_url: null,
    transcript: null,
    speaker_segments: null,
    summary: null,
    tags: [],
    source: 'manual',
    audio_source: null,
    created_at: '2026-03-26T10:00:00.000Z',
    updated_at: '2026-03-26T10:00:00.000Z',
    folder_id: null,
    folder: null,
    body_html: '',
    plain_text_snapshot: '',
    content_state: 'empty',
    media_assets: [],
    audio_object_key: null,
    media_task_run_id: null,
    media_task_status: null,
    media_task_error_message: null,
    backup_status: 'pending',
    entity_version: 1,
    last_backup_at: null,
    deleted_at: null,
    is_filmed: false,
    filmed_at: null,
    ...overrides,
  };
}

const emptyManualPlaceholderTicket = {
  fragmentId: 'fragment-1',
  kind: 'empty_manual_placeholder' as const,
  created_at_ms: 1_000,
};

test('resolveFragmentCleanup returns animated delete when empty placeholder is visible', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment(),
    { nowMs: 1_500, visibleFragments: [{ id: 'fragment-1' }] }
  );

  assert.deepEqual(resolution, {
    action: 'delete',
    fragmentId: 'fragment-1',
    shouldAnimate: true,
  });
});

test('resolveFragmentCleanup skips when ticket target is not in current list', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment(),
    { nowMs: 1_500, visibleFragments: [{ id: 'fragment-2' }] }
  );

  assert.deepEqual(resolution, { action: 'skip' });
});

test('resolveFragmentCleanup defers recent manual fragment before save settles in list', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment({ body_html: '<p>已有正文</p>' }),
    { nowMs: 1_100, visibleFragments: [{ id: 'fragment-1' }] }
  );

  assert.deepEqual(resolution, {
    action: 'defer',
    fragmentId: 'fragment-1',
    delay_ms: 200,
  });
});

test('resolveFragmentCleanup clears ticket when manual fragment still has content after settle', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment({ body_html: '<p>已有正文</p>' }),
    { nowMs: 1_500, visibleFragments: [{ id: 'fragment-1' }] }
  );

  assert.deepEqual(resolution, {
    action: 'clear',
    fragmentId: 'fragment-1',
  });
});

test('resolveFragmentCleanup clears ticket for empty non-manual fragment', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment({ source: 'voice' }),
    { nowMs: 1_100, visibleFragments: [{ id: 'fragment-1' }] }
  );

  assert.deepEqual(resolution, {
    action: 'clear',
    fragmentId: 'fragment-1',
  });
});

test('resolveFragmentCleanup clears ticket when manual fragment keeps metadata after settle', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment({ summary: '保留摘要' }),
    { nowMs: 1_500, visibleFragments: [{ id: 'fragment-1' }] }
  );

  assert.deepEqual(resolution, {
    action: 'clear',
    fragmentId: 'fragment-1',
  });
});

test('resolveFragmentCleanup deletes empty placeholder outside fragment list without animation', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment(),
    { nowMs: 1_500 }
  );

  assert.deepEqual(resolution, {
    action: 'delete',
    fragmentId: 'fragment-1',
    shouldAnimate: false,
  });
});

test('resolveFragmentCleanup defers recent manual fragment before save settles outside list', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment({ body_html: '<p>已有正文</p>' }),
    { nowMs: 1_100 }
  );

  assert.deepEqual(resolution, {
    action: 'defer',
    fragmentId: 'fragment-1',
    delay_ms: 200,
  });
});

test('resolveFragmentCleanup clears ticket for empty non-manual fragment outside list', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment({ source: 'video_parse' }),
    { nowMs: 1_100 }
  );

  assert.deepEqual(resolution, {
    action: 'clear',
    fragmentId: 'fragment-1',
  });
});

test('resolveFragmentCleanup clears ticket when manual fragment keeps audio after settle', () => {
  const resolution = resolveFragmentCleanup(
    emptyManualPlaceholderTicket,
    buildFragment({ audio_object_key: 'audio/manual/demo.m4a' }),
    { nowMs: 1_500 }
  );

  assert.deepEqual(resolution, {
    action: 'clear',
    fragmentId: 'fragment-1',
  });
});

test('resolveFragmentCleanup clears ticket when fragment no longer exists', () => {
  const resolution = resolveFragmentCleanup(emptyManualPlaceholderTicket, null, {
    nowMs: 1_500,
  });

  assert.deepEqual(resolution, {
    action: 'clear',
    fragmentId: 'fragment-1',
  });
});
