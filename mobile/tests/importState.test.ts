import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExternalAudioImportPayload,
  isImportLinkReady,
  resolveImportedFragmentId,
} from '../features/imports/importState';

test('buildExternalAudioImportPayload trims share url and appends folder id', () => {
  assert.deepEqual(
    buildExternalAudioImportPayload('  https://v.douyin.com/demo  ', 'folder-001'),
    {
      share_url: 'https://v.douyin.com/demo',
      platform: 'auto',
      folder_id: 'folder-001',
    }
  );
});

test('buildExternalAudioImportPayload omits empty folder id', () => {
  assert.deepEqual(buildExternalAudioImportPayload('https://v.douyin.com/demo'), {
    share_url: 'https://v.douyin.com/demo',
    platform: 'auto',
  });
});

test('isImportLinkReady only accepts non-empty links', () => {
  assert.equal(isImportLinkReady(''), false);
  assert.equal(isImportLinkReady('   '), false);
  assert.equal(isImportLinkReady('https://v.douyin.com/demo'), true);
});

test('resolveImportedFragmentId prefers task resource when available', () => {
  assert.equal(
    resolveImportedFragmentId('fragment-task', {
      status: 'succeeded',
      resource: {
        resource_type: 'fragment',
        resource_id: 'fragment-task',
      },
    }),
    'fragment-task'
  );
});

test('resolveImportedFragmentId falls back to task fragment id', () => {
  assert.equal(
    resolveImportedFragmentId('fragment-task', {
      status: 'failed',
      resource: {
        resource_type: 'fragment',
        resource_id: 'fragment-task',
      },
    }),
    'fragment-task'
  );
});
