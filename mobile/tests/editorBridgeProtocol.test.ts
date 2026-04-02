/**
 * 编辑器桥接层协议测试
 *
 * 覆盖 html.ts 中原生桥接所依赖的核心函数契约：
 * - HTML 包裹/解包往返稳定性
 * - asset:// 引用提取与生成
 * - 纯文本提取
 * - 保存快照桥接回退链路
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createImageHtml,
  ensureFirstLineIsTitle,
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  extractPreviewSkippingTitle,
  extractTitleFromFirstLine,
  unwrapHtmlFromNativeEditor,
  wrapHtmlForNativeEditor,
} from '../features/editor/html';
import { resolveEditorSnapshotForSave } from '../features/editor/saveSnapshot';
import type { EditorDocumentSnapshot } from '../features/editor/types';

function buildSnapshot(bodyHtml: string): EditorDocumentSnapshot {
  /*为桥接测试构造最小快照载荷。 */
  return {
    body_html: bodyHtml,
    plain_text: bodyHtml.replace(/<[^>]+>/g, '').trim(),
    asset_ids: [],
  };
}

// ============================================================================
// wrapHtmlForNativeEditor
// ============================================================================

test('wrapHtmlForNativeEditor 对空输入返回包含空段落的最小合法 HTML 壳', () => {
  assert.equal(wrapHtmlForNativeEditor(''), '<html>\n<p></p>\n</html>');
  assert.equal(wrapHtmlForNativeEditor(null), '<html>\n<p></p>\n</html>');
});

test('wrapHtmlForNativeEditor 包裹非空正文并保留内容', () => {
  const result = wrapHtmlForNativeEditor('<p>正文</p>');
  assert.equal(result, '<html>\n<p>正文</p>\n</html>');
});

// ============================================================================
// unwrapHtmlFromNativeEditor
// ============================================================================

test('unwrapHtmlFromNativeEditor 剥离 html 壳并还原正文', () => {
  const result = unwrapHtmlFromNativeEditor('<html>\n<p>正文</p>\n</html>');
  assert.equal(result, '<p>正文</p>');
});

test('unwrapHtmlFromNativeEditor 同时剥除首尾空段落', () => {
  const input = '<html>\n<p></p>\n<p>正文</p>\n<p></p>\n</html>';
  assert.equal(unwrapHtmlFromNativeEditor(input), '<p>正文</p>');
});

test('unwrapHtmlFromNativeEditor 对空输入返回空字符串', () => {
  assert.equal(unwrapHtmlFromNativeEditor(''), '');
  assert.equal(unwrapHtmlFromNativeEditor(null), '');
});

// ============================================================================
// 包裹/解包往返稳定性
// ============================================================================

test('wrap + unwrap 往返后正文内容稳定不变', () => {
  const original = '<h1>标题</h1>\n<p>段落一</p>\n<p>段落二</p>';
  const roundtripped = unwrapHtmlFromNativeEditor(wrapHtmlForNativeEditor(original));
  assert.equal(roundtripped, original);
});

test('wrap + unwrap 对含图片的正文保持稳定', () => {
  const original = '<p>文字</p>\n<p><img src="asset://img-1" alt="图片" /></p>';
  const roundtripped = unwrapHtmlFromNativeEditor(wrapHtmlForNativeEditor(original));
  assert.equal(roundtripped, original);
});

// ============================================================================
// extractAssetIdsFromHtml
// ============================================================================

test('extractAssetIdsFromHtml 按 DOM 顺序提取 asset:// 引用', () => {
  const html = '<p><img src="asset://img-a" /></p><p><img src="asset://img-b" /></p>';
  assert.deepEqual(extractAssetIdsFromHtml(html), ['img-a', 'img-b']);
});

test('extractAssetIdsFromHtml 对重复引用去重并保留首次出现顺序', () => {
  const html =
    '<p><img src="asset://img-a" /></p>' +
    '<p><img src="asset://img-b" /></p>' +
    '<p><img src="asset://img-a" /></p>';
  assert.deepEqual(extractAssetIdsFromHtml(html), ['img-a', 'img-b']);
});

test('extractAssetIdsFromHtml 对无图片正文返回空数组', () => {
  assert.deepEqual(extractAssetIdsFromHtml('<p>纯文字正文</p>'), []);
  assert.deepEqual(extractAssetIdsFromHtml(''), []);
});

test('extractAssetIdsFromHtml 忽略非 asset:// 的普通图片链接', () => {
  const html = '<p><img src="https://example.com/image.png" /></p>';
  assert.deepEqual(extractAssetIdsFromHtml(html), []);
});

// ============================================================================
// createImageHtml
// ============================================================================

test('createImageHtml 生成标准 asset:// src 格式', () => {
  const result = createImageHtml('img-123', '封面图');
  assert.equal(result, '<img src="asset://img-123" alt="封面图" />');
});

test('createImageHtml 转义 alt 属性中的双引号', () => {
  const result = createImageHtml('img-1', 'it is a "photo"');
  assert.ok(result.includes('alt="it is a &quot;photo&quot;"'));
});

test('createImageHtml 省略 alt 参数时生成空 alt', () => {
  const result = createImageHtml('img-1');
  assert.equal(result, '<img src="asset://img-1" alt="" />');
});

// ============================================================================
// extractPlainTextFromHtml
// ============================================================================

test('extractPlainTextFromHtml 折叠块级元素并去除 HTML 标签', () => {
  const result = extractPlainTextFromHtml('<h1>标题</h1><p>段落</p>');
  assert.equal(result, '标题 段落');
});

test('extractPlainTextFromHtml 将图片替换为空格而非删除', () => {
  const result = extractPlainTextFromHtml('<p>文字<img src="asset://img-1" />更多文字</p>');
  assert.ok(result.includes('文字'));
  assert.ok(result.includes('更多文字'));
});

test('extractPlainTextFromHtml 对空输入返回空字符串', () => {
  assert.equal(extractPlainTextFromHtml(''), '');
  assert.equal(extractPlainTextFromHtml(null), '');
});

// ============================================================================
// extractTitleFromFirstLine / extractPreviewSkippingTitle
// ============================================================================

test('extractTitleFromFirstLine 仅提取正文开头的 h1（支持多行）', () => {
  const html = ' \n<h1>第一行\n标题</h1>\n<p>正文段落</p><h1>后续标题</h1>';
  assert.equal(extractTitleFromFirstLine(html), '第一行 标题');
});

test('extractTitleFromFirstLine 不会把中间 h1 误识别为首行标题', () => {
  const html = '<blockquote>引言</blockquote><h1>中间标题</h1><p>正文</p>';
  assert.equal(extractTitleFromFirstLine(html), '引言 中间标题 正文');
});

test('extractPreviewSkippingTitle 移除开头多行 h1 并保留正文预览', () => {
  const html = '<h1>主标题\n副标题</h1>\n<p>第一段正文</p><p>第二段正文</p>';
  assert.equal(extractPreviewSkippingTitle(html), '第一段正文 第二段正文');
});

test('extractPreviewSkippingTitle 不会移除中间出现的 h1', () => {
  const html = '<p>开场白</p><h1>中间标题</h1><p>正文</p>';
  assert.equal(extractPreviewSkippingTitle(html), '中间标题 正文');
});

// ============================================================================
// resolveEditorSnapshotForSave — 桥接读取为 null 时的回退
// ============================================================================

// ============================================================================
// ensureFirstLineIsTitle
// ============================================================================

test('ensureFirstLineIsTitle 把首个 <p> 块升格为 <h1>', () => {
  assert.equal(
    ensureFirstLineIsTitle('<p>我的标题</p><p>正文段落</p>'),
    '<h1>我的标题</h1><p>正文段落</p>'
  );
});

test('ensureFirstLineIsTitle 空 <p> 也升格为 <h1>', () => {
  assert.equal(ensureFirstLineIsTitle('<p></p>'), '<h1></h1>');
});

test('ensureFirstLineIsTitle 首块已是 <h1> 时保持不变', () => {
  const html = '<h1>已是标题</h1><p>段落</p>';
  assert.equal(ensureFirstLineIsTitle(html), html);
});

test('ensureFirstLineIsTitle 首块为 <ul> 等非 <p> 块时保持不变', () => {
  const html = '<ul><li>列表项</li></ul>';
  assert.equal(ensureFirstLineIsTitle(html), html);
});

test('ensureFirstLineIsTitle 保留 <p> 上的属性', () => {
  assert.equal(
    ensureFirstLineIsTitle('<p class="lead">内容</p>'),
    '<h1 class="lead">内容</h1>'
  );
});

test('ensureFirstLineIsTitle 对空字符串返回空字符串', () => {
  assert.equal(ensureFirstLineIsTitle(''), '');
});

test('ensureFirstLineIsTitle 首段含行内标签时保持内容完整', () => {
  assert.equal(
    ensureFirstLineIsTitle('<p><strong>加粗标题</strong></p><p>正文</p>'),
    '<h1><strong>加粗标题</strong></h1><p>正文</p>'
  );
});

// ============================================================================
// resolveEditorSnapshotForSave — 桥接读取为 null 时的回退
// ============================================================================

test('resolveEditorSnapshotForSave readSnapshot 返回 null 时回退到 getSnapshot', async () => {
  /*原生桥接偶发返回 null 时，应回落到内存中的最后一帧快照，而非丢弃内容。 */
  const snapshot = await resolveEditorSnapshotForSave({
    editor: {
      getSnapshot: () => buildSnapshot('<p>内存快照</p>'),
      readSnapshot: async () => null,
    },
    fallbackSnapshot: buildSnapshot('<p>回退快照</p>'),
  });

  assert.equal(snapshot.body_html, '<p>内存快照</p>');
});
