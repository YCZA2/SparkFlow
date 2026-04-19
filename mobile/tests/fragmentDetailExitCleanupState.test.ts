import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFragmentDetailCleanupTicket } from '../features/fragments/detail/exitCleanup';
import type { Fragment } from '../types/fragment';

function buildFragment(overrides: Partial<Fragment> = {}): Fragment {
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

test('resolveFragmentDetailCleanupTicket registers cleanup ticket for ordinary exit', () => {
  assert.deepEqual(
    resolveFragmentDetailCleanupTicket({
      skipCleanupTicket: false,
      fragmentId: 'fragment-1',
      fragment: buildFragment(),
      cleanupOnReturn: 'empty_manual_placeholder',
      createdAtMs: 123,
    }),
    {
      fragmentId: 'fragment-1',
      kind: 'empty_manual_placeholder',
      created_at_ms: 123,
    }
  );
});

test('resolveFragmentDetailCleanupTicket skips cleanup ticket for delete bypass exit', () => {
  assert.deepEqual(
    resolveFragmentDetailCleanupTicket({
      skipCleanupTicket: true,
      fragmentId: 'fragment-1',
      fragment: buildFragment(),
      cleanupOnReturn: 'empty_manual_placeholder',
      createdAtMs: 123,
    }),
    null
  );
});

test('resolveFragmentDetailCleanupTicket skips cleanup ticket when disabled', () => {
  assert.deepEqual(
    resolveFragmentDetailCleanupTicket({
      skipCleanupTicket: false,
      fragmentId: 'fragment-1',
      fragment: buildFragment(),
      cleanupOnReturn: null,
      createdAtMs: 123,
    }),
    null
  );
});

test('resolveFragmentDetailCleanupTicket skips cleanup ticket when current snapshot has text', () => {
  assert.deepEqual(
    resolveFragmentDetailCleanupTicket({
      skipCleanupTicket: false,
      fragmentId: 'fragment-1',
      fragment: buildFragment(),
      cleanupOnReturn: 'empty_manual_placeholder',
      createdAtMs: 123,
      currentSnapshot: {
        body_html: '<p>已有内容</p>',
        plain_text: '已有内容',
        asset_ids: [],
      },
    }),
    null
  );
});

test('resolveFragmentDetailCleanupTicket skips cleanup ticket when current snapshot keeps image', () => {
  assert.deepEqual(
    resolveFragmentDetailCleanupTicket({
      skipCleanupTicket: false,
      fragmentId: 'fragment-1',
      fragment: buildFragment({
        media_assets: [{ id: 'old-asset' } as any],
      }),
      cleanupOnReturn: 'empty_manual_placeholder',
      createdAtMs: 123,
      currentSnapshot: {
        body_html: '<img src=\"asset://asset-1\" alt=\"\" />',
        plain_text: '',
        asset_ids: ['asset-1'],
      },
    }),
    null
  );
});
