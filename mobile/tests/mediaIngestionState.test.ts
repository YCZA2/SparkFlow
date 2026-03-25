import assert from 'node:assert/strict';
import test from 'node:test';

import {
  unwrapHtmlFromNativeEditor,
  wrapHtmlForNativeEditor,
} from '../features/editor/html';
import {
  extractMediaIngestionOutput,
  resolveMediaIngestionFragmentPatch,
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

test('resolveMediaIngestionFragmentPatch seeds editable body when transcript arrives first', () => {
  const patch = resolveMediaIngestionFragmentPatch({
    current: {
      body_html: '',
      plain_text_snapshot: '',
      content_state: 'empty',
    } as any,
    output: {
      transcript: '第一句\n第二句',
      summary: '摘要',
      tags: ['标签'],
      speaker_segments: null,
      audio_object_key: 'audio/original/demo.m4a',
      audio_file_url: 'https://example.com/audio.m4a',
      audio_file_expires_at: '2026-03-17T12:00:00Z',
    },
  });

  assert.equal(patch.body_html, '<p>第一句<br />第二句</p>');
  assert.equal(patch.plain_text_snapshot, '第一句\n第二句');
  assert.equal(patch.content_state, 'body_present');
  assert.equal(patch.transcript, '第一句\n第二句');
});

test('resolveMediaIngestionFragmentPatch does not overwrite existing body html', () => {
  const patch = resolveMediaIngestionFragmentPatch({
    current: {
      body_html: '<p>用户已整理正文</p>',
      plain_text_snapshot: '用户已整理正文',
      content_state: 'body_present',
    } as any,
    output: {
      transcript: '新的转写原文',
      summary: '摘要',
      tags: ['标签'],
      speaker_segments: null,
      audio_object_key: null,
      audio_file_url: null,
      audio_file_expires_at: null,
    },
  });

  assert.equal(patch.body_html, undefined);
  assert.equal(patch.plain_text_snapshot, undefined);
  assert.equal(patch.content_state, undefined);
  assert.equal(patch.transcript, '新的转写原文');
});

test('wrapHtmlForNativeEditor wraps project html for native protocol', () => {
  assert.equal(wrapHtmlForNativeEditor('<p>你好</p>'), '<html>\n<p>你好</p>\n</html>');
});

test('unwrapHtmlFromNativeEditor removes native wrapper and edge empty paragraphs', () => {
  assert.equal(
    unwrapHtmlFromNativeEditor('<html>\n<p></p>\n<p>你好</p>\n<p></p>\n</html>'),
    '<p>你好</p>'
  );
});
