import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractMediaIngestionOutput,
  resolveMediaIngestionFragmentId,
} from '../features/pipelines/mediaIngestionState';

test('extractMediaIngestionOutput keeps transcript, summary and tags from pipeline output', () => {
  assert.deepEqual(
    extractMediaIngestionOutput({
      output: {
        transcript: '这是一段转写',
        summary: '摘要',
        tags: ['灵感', '选题'],
        audio_file_url: 'https://example.com/audio.m4a',
        audio_file_expires_at: '2026-03-17T12:00:00Z',
      },
    } as any),
    {
      transcript: '这是一段转写',
      summary: '摘要',
      tags: ['灵感', '选题'],
      speaker_segments: null,
      audio_object_key: null,
      audio_file_url: 'https://example.com/audio.m4a',
      audio_file_expires_at: '2026-03-17T12:00:00Z',
    }
  );
});

test('extractMediaIngestionOutput extracts valid speaker_segments from pipeline output', () => {
  const segments = [
    { speaker_id: 'SPEAKER_0', start_ms: 0, end_ms: 1200, text: '你好' },
    { speaker_id: 'SPEAKER_1', start_ms: 1300, end_ms: 2500, text: '世界' },
  ];
  assert.deepEqual(
    extractMediaIngestionOutput({
      output: {
        transcript: '你好世界',
        summary: '摘要',
        tags: ['标签'],
        speaker_segments: segments,
        audio_file_url: null,
        audio_file_expires_at: null,
      },
    } as any).speaker_segments,
    segments
  );
});

test('extractMediaIngestionOutput falls back to audio_file payload object key', () => {
  assert.equal(
    extractMediaIngestionOutput({
      output: {
        audio_file: {
          object_key: 'audio/original/test-user-001/fragment-1/demo.m4a',
        },
      },
    } as any).audio_object_key,
    'audio/original/test-user-001/fragment-1/demo.m4a'
  );
});

test('resolveMediaIngestionFragmentId prefers pipeline resource id', () => {
  assert.equal(
    resolveMediaIngestionFragmentId('fragment-local', {
      status: 'succeeded',
      resource: {
        resource_type: 'local_fragment',
        resource_id: 'fragment-terminal',
      },
    } as any),
    'fragment-terminal'
  );
});

test('resolveMediaIngestionFragmentId falls back to local placeholder id', () => {
  assert.equal(
    resolveMediaIngestionFragmentId('fragment-local', {
      status: 'running',
      resource: {
        resource_type: 'local_fragment',
        resource_id: 'fragment-terminal',
      },
    } as any),
    'fragment-local'
  );
});
