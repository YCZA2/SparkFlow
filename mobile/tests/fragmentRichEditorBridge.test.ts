import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPatchToEditor,
  buildEditorSnapshot,
  createMarkdownRenderer,
  syncEditorImages,
} from '../features/fragments/components/fragmentRichEditorBridge';
import type { FragmentAiPatch, MediaAsset } from '../types/fragment';

function buildImageAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    media_kind: 'image',
    original_filename: 'cover.png',
    mime_type: 'image/png',
    file_size: 1,
    checksum: null,
    width: 120,
    height: 80,
    duration_ms: null,
    status: 'ready',
    created_at: null,
    file_url: 'https://cdn.example.com/cover.png',
    expires_at: null,
    ...overrides,
  };
}

test('buildEditorSnapshot serializes supported blocks into stable markdown', () => {
  const snapshot = buildEditorSnapshot({
    content: [
      {
        type: 'heading',
        content: [{ type: 'text', text: '标题' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '加粗', marks: [{ type: 'bold' }] },
          { type: 'text', text: '和' },
          { type: 'text', text: '斜体', marks: [{ type: 'italic' }] },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一项' }] }],
          },
        ],
      },
      {
        type: 'image',
        attrs: {
          assetId: 'asset-1',
          alt: '配图',
        },
      },
    ],
  });

  assert.equal(
    snapshot.body_markdown,
    '# 标题\n\n**加粗**和*斜体*\n\n- 第一项\n\n![配图](asset://asset-1)'
  );
  assert.equal(snapshot.plain_text, '标题 加粗和斜体 第一项');
  assert.deepEqual(snapshot.asset_ids, ['asset-1']);
});

test('createMarkdownRenderer resolves asset references to live file urls', () => {
  const renderer = createMarkdownRenderer([buildImageAsset()]);
  const html = renderer.render('![配图](asset://asset-1)');

  assert.match(html, /src="https:\/\/cdn\.example\.com\/cover\.png"/);
  assert.match(html, /data-asset-id="asset-1"/);
  assert.match(html, /data-width="120"/);
  assert.match(html, /data-height="80"/);
});

test('applyPatchToEditor renders markdown snippets before replacing selection', () => {
  const calls: Array<{ target: number | { from: number; to: number }; value: string }> = [];
  const editor = {
    state: {
      selection: { from: 3, to: 8 },
    },
    commands: {
      insertContentAt(target: number | { from: number; to: number }, value: string) {
        calls.push({ target, value });
      },
    },
  };
  const patch: FragmentAiPatch = {
    op: 'replace_selection',
    markdown_snippet: '# 新标题',
  };

  applyPatchToEditor(editor as never, patch, (markdown) => `<p>${markdown}</p>`);

  assert.deepEqual(calls, [
    {
      target: { from: 3, to: 8 },
      value: '<p># 新标题</p>',
    },
  ]);
});

test('syncEditorImages updates existing image nodes when asset urls change', () => {
  const updates: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  const editor = {
    state: {
      doc: {
        descendants(visitor: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => void) {
          visitor(
            {
              type: { name: 'image' },
              attrs: {
                assetId: 'asset-1',
                src: 'file:///old-cover.png',
                alt: '旧图',
                width: null,
                height: null,
              },
            },
            5
          );
        },
      },
    },
    commands: {
      command(
        callback: (input: {
          tr: {
            setNodeMarkup: (
              pos: number,
              type: undefined,
              attrs: Record<string, unknown>
            ) => void;
          };
          dispatch?: (tr: unknown) => void;
        }) => boolean
      ) {
        const tr = {
          setNodeMarkup(pos: number, _type: undefined, attrs: Record<string, unknown>) {
            updates.push({ pos, attrs });
          },
        };
        callback({
          tr,
          dispatch: () => undefined,
        });
      },
    },
  };

  syncEditorImages(editor as never, [buildImageAsset()]);

  assert.deepEqual(updates, [
    {
      pos: 5,
      attrs: {
        assetId: 'asset-1',
        src: 'https://cdn.example.com/cover.png',
        alt: 'cover.png',
        width: 120,
        height: 80,
      },
    },
  ]);
});
