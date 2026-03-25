import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isFailedMediaIngestionFragment,
  isProcessingMediaIngestionFragment,
} from '../features/pipelines/mediaIngestionRecoveryState';

function buildFragment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fragment-1',
    source: 'voice',
    audio_source: 'upload',
    plain_text_snapshot: '',
    transcript: null,
    media_pipeline_run_id: 'run-001',
    media_pipeline_status: 'queued',
    ...overrides,
  };
}

test('isProcessingMediaIngestionFragment returns true for media placeholder before transcript arrives', () => {
  assert.equal(isProcessingMediaIngestionFragment(buildFragment() as any), true);
});

test('isProcessingMediaIngestionFragment returns false once body text exists', () => {
  assert.equal(
    isProcessingMediaIngestionFragment(
      buildFragment({
        plain_text_snapshot: '已经有正文',
        media_pipeline_status: 'running',
      }) as any
    ),
    false
  );
});

test('isFailedMediaIngestionFragment only marks failed media fragments with run id', () => {
  assert.equal(
    isFailedMediaIngestionFragment(
      buildFragment({
        media_pipeline_status: 'failed',
      }) as any
    ),
    true
  );
  assert.equal(
    isFailedMediaIngestionFragment(
      buildFragment({
        media_pipeline_status: 'failed',
        media_pipeline_run_id: null,
      }) as any
    ),
    false
  );
});
