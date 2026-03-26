import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveEditorSnapshotForSave } from '../features/editor/saveSnapshot';
import type { EditorDocumentSnapshot } from '../features/editor/types';

function buildSnapshot(bodyHtml: string): EditorDocumentSnapshot {
  /*为保存快照测试构造最小正文载荷，聚焦桥接读取与回退逻辑。 */
  return {
    body_html: bodyHtml,
    plain_text: bodyHtml.replace(/<[^>]+>/g, '').trim(),
    asset_ids: [],
  };
}

test('resolveEditorSnapshotForSave prefers bridge snapshot for explicit saves', async () => {
  const snapshot = await resolveEditorSnapshotForSave({
    editor: {
      getSnapshot: () => buildSnapshot('<p>旧正文</p>'),
      readSnapshot: async () => buildSnapshot('<p>最新正文</p>'),
    },
    fallbackSnapshot: buildSnapshot('<p>回退正文</p>'),
  });

  assert.equal(snapshot.body_html, '<p>最新正文</p>');
});

test('resolveEditorSnapshotForSave falls back to last known snapshot when bridge read fails', async () => {
  const snapshot = await resolveEditorSnapshotForSave({
    editor: {
      getSnapshot: () => buildSnapshot('<p>内存正文</p>'),
      readSnapshot: async () => {
        throw new Error('bridge unavailable');
      },
    },
    fallbackSnapshot: buildSnapshot('<p>回退正文</p>'),
  });

  assert.equal(snapshot.body_html, '<p>内存正文</p>');
});

test('resolveEditorSnapshotForSave uses fallback snapshot when editor handle is missing', async () => {
  const snapshot = await resolveEditorSnapshotForSave({
    editor: null,
    fallbackSnapshot: buildSnapshot('<p>回退正文</p>'),
  });

  assert.equal(snapshot.body_html, '<p>回退正文</p>');
});
