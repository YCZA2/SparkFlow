import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldDeleteEmptyManualFragmentOnExit } from '../features/fragments/detail/exitState';
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
    media_pipeline_run_id: null,
    media_pipeline_status: null,
    media_pipeline_error_message: null,
    backup_status: 'pending',
    entity_version: 1,
    last_backup_at: null,
    deleted_at: null,
    is_filmed: false,
    filmed_at: null,
    ...overrides,
  };
}

test('shouldDeleteEmptyManualFragmentOnExit returns true for untouched manual placeholder', () => {
  assert.equal(
    shouldDeleteEmptyManualFragmentOnExit({
      fragment: buildFragment(),
      snapshot: {
        body_html: '',
        plain_text: '',
        asset_ids: [],
      },
      mediaAssets: [],
    }),
    true
  );
});

test('shouldDeleteEmptyManualFragmentOnExit keeps fragment when body has meaningful text', () => {
  assert.equal(
    shouldDeleteEmptyManualFragmentOnExit({
      fragment: buildFragment(),
      snapshot: {
        body_html: '<p>有内容</p>',
        plain_text: '有内容',
        asset_ids: [],
      },
      mediaAssets: [],
    }),
    false
  );
});

test('shouldDeleteEmptyManualFragmentOnExit keeps fragment when only image exists', () => {
  assert.equal(
    shouldDeleteEmptyManualFragmentOnExit({
      fragment: buildFragment(),
      snapshot: {
        body_html: '<img src="asset://asset-1" alt="" />',
        plain_text: '',
        asset_ids: ['asset-1'],
      },
      mediaAssets: [
        {
          id: 'asset-1',
          media_kind: 'image',
          original_filename: 'cover.png',
          mime_type: 'image/png',
          file_size: 1,
          checksum: null,
          width: null,
          height: null,
          duration_ms: null,
          status: 'pending',
          created_at: null,
          file_url: 'file:///tmp/cover.png',
          expires_at: null,
        },
      ],
    }),
    false
  );
});

test('shouldDeleteEmptyManualFragmentOnExit keeps non-manual fragments', () => {
  assert.equal(
    shouldDeleteEmptyManualFragmentOnExit({
      fragment: buildFragment({ source: 'voice' }),
      snapshot: {
        body_html: '',
        plain_text: '',
        asset_ids: [],
      },
      mediaAssets: [],
    }),
    false
  );
});
