/**
 * 编辑器 Hydration 契约测试
 *
 * 覆盖 sessionHydration.ts 中 reconcileHydration 三条分支、
 * shouldRehydrateEditorSession 边界情况、mergeVisibleMediaAssets
 * 以及 shouldCommitOptimisticDocument 触发条件。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeVisibleMediaAssets,
  shouldCommitOptimisticDocument,
  shouldRehydrateEditorSession,
} from '../features/editor/sessionHydration';
import {
  buildEditorDocumentSnapshot,
  createInitialEditorSessionState,
  reduceEditorSession,
} from '../features/editor/sessionState';
import type { EditorDocumentSnapshot, EditorMediaAsset, EditorSourceDocument } from '../features/editor/types';

// ============================================================================
// 测试辅助
// ============================================================================

function buildDocument(overrides: Partial<EditorSourceDocument> = {}): EditorSourceDocument {
  /*构造最小来源文档，聚焦每个测试的关注点。 */
  return {
    id: 'doc-1',
    body_html: '<p>服务端正文</p>',
    media_assets: [],
    ...overrides,
  };
}

function buildAsset(id: string): EditorMediaAsset {
  /*构造最小媒体资产，供素材合并和提交判断测试使用。 */
  return {
    id,
    media_kind: 'image',
    original_filename: `${id}.png`,
    mime_type: 'image/png',
    file_size: 0,
    checksum: null,
    width: null,
    height: null,
    duration_ms: null,
    status: 'ready',
    created_at: null,
  };
}

// ============================================================================
// reconcileHydration — 通过 reducer 验证三条分支
// ============================================================================

test('reconcileHydration 在 pending_body_loaded 为 false 时保持 booting 阶段', () => {
  /*source.document 已到但待同步正文加载未完成，应等待而不提前 hydrate。 */
  let state = createInitialEditorSessionState('doc-1');
  state = reduceEditorSession(state, {
    type: 'SOURCE_DOCUMENT_LOADED',
    document: buildDocument(),
  });

  // 此时 pending_body_loaded 仍为 false（PENDING_BODY_HTML_LOADED 尚未 dispatch）
  assert.equal(state.isPendingBodyHydrated, false);
  assert.equal(state.phase, 'booting');
});

test('reconcileHydration 所有来源就绪后完成初始化并标记 isPendingBodyHydrated', () => {
  /*三个来源全部到位后，reconcileHydration 应建立 baseline 并进入就绪状态。 */
  let state = createInitialEditorSessionState('doc-1');
  state = reduceEditorSession(state, {
    type: 'SOURCE_DOCUMENT_LOADED',
    document: buildDocument({ body_html: '<p>服务端正文</p>' }),
  });
  state = reduceEditorSession(state, {
    type: 'BASELINE_CONTENT_LOADED',
    html: '<p>服务端正文</p>',
  });
  state = reduceEditorSession(state, {
    type: 'PENDING_BODY_HTML_LOADED',
    html: null,
  });

  assert.equal(state.isPendingBodyHydrated, true);
  assert.ok(state.baseline !== null);
  assert.equal(state.snapshot.body_html, '<p>服务端正文</p>');
});

test('reconcileHydration 走 sync-only 分支：内容未变时不重置 editorKey 和 snapshot', () => {
  /*服务端推送同内容的文档更新时，应只同步 syncStatus，不触发编辑器重建。 */
  let state = createInitialEditorSessionState('doc-1');
  state = reduceEditorSession(state, {
    type: 'SOURCE_DOCUMENT_LOADED',
    document: buildDocument({ body_html: '<p>正文</p>' }),
  });
  state = reduceEditorSession(state, {
    type: 'PENDING_BODY_HTML_LOADED',
    html: null,
  });

  const editorKeyAfterInit = state.editorKey;
  const snapshotAfterInit = state.snapshot;

  // 推送相同内容的文档刷新，携带已同步标记
  state = reduceEditorSession(state, {
    type: 'SOURCE_DOCUMENT_LOADED',
    document: buildDocument({
      body_html: '<p>正文</p>',
      save_state: 'synced',
    }),
  });

  assert.equal(state.editorKey, editorKeyAfterInit, '不应重建 editorKey');
  assert.equal(state.snapshot, snapshotAfterInit, '不应替换 snapshot 对象引用');
  assert.equal(state.syncStatus, 'synced', '应同步 syncStatus');
});

test('reconcileHydration 在 documentId 切换时重置会话并重新初始化', () => {
  /*切换到新文档时，必须重建 baseline，editorKey 应更新。 */
  let state = createInitialEditorSessionState('doc-1');
  state = reduceEditorSession(state, {
    type: 'SOURCE_DOCUMENT_LOADED',
    document: buildDocument({ id: 'doc-1', body_html: '<p>文档一</p>' }),
  });
  state = reduceEditorSession(state, { type: 'PENDING_BODY_HTML_LOADED', html: null });

  state = reduceEditorSession(state, { type: 'RESET_SESSION', documentId: 'doc-2' });
  state = reduceEditorSession(state, {
    type: 'SOURCE_DOCUMENT_LOADED',
    document: buildDocument({ id: 'doc-2', body_html: '<p>文档二</p>' }),
  });
  state = reduceEditorSession(state, { type: 'PENDING_BODY_HTML_LOADED', html: null });

  assert.equal(state.editorKey, 'doc-2');
  assert.equal(state.snapshot.body_html, '<p>文档二</p>');
});

// ============================================================================
// shouldRehydrateEditorSession — 边界情况
// ============================================================================

test('shouldRehydrateEditorSession 远端正文比本地短时不触发刷新', () => {
  /*防止服务端返回旧的短版本覆盖用户已扩展的本地内容。 */
  const shouldRehydrate = shouldRehydrateEditorSession({
    document: buildDocument({ body_html: '<p>短</p>' }),
    pendingBodyHtml: null,
    currentSnapshot: buildEditorDocumentSnapshot('<p>这是一段更长的本地正文内容</p>'),
    baselineBodyHtml: '<p>这是一段更长的本地正文内容</p>',
    visibleMediaAssets: [],
    hasConfirmedLocalEdit: false,
  });

  assert.equal(shouldRehydrate, false);
});

test('shouldRehydrateEditorSession 仅素材列表增加时触发刷新', () => {
  /*服务端同步了新图片素材但正文未变，应刷新以展示新素材。 */
  const currentSnapshot = buildEditorDocumentSnapshot('<p>正文</p>');
  const shouldRehydrate = shouldRehydrateEditorSession({
    document: buildDocument({
      body_html: '<p>正文</p>',
      media_assets: [buildAsset('asset-new')],
    }),
    pendingBodyHtml: null,
    currentSnapshot,
    baselineBodyHtml: '<p>正文</p>',
    visibleMediaAssets: [],
    hasConfirmedLocalEdit: false,
  });

  assert.equal(shouldRehydrate, true);
});

test('shouldRehydrateEditorSession 正文和素材均无变化时不触发刷新', () => {
  /*服务端推送的内容与当前状态完全一致时，不应产生任何刷新动作。 */
  const html = '<p>正文</p>';
  const snapshot = buildEditorDocumentSnapshot(html);
  const shouldRehydrate = shouldRehydrateEditorSession({
    document: buildDocument({ body_html: html, media_assets: [] }),
    pendingBodyHtml: null,
    currentSnapshot: snapshot,
    baselineBodyHtml: html,
    visibleMediaAssets: [],
    hasConfirmedLocalEdit: false,
  });

  assert.equal(shouldRehydrate, false);
});

test('shouldRehydrateEditorSession 本地待同步正文存在时始终阻止远端刷新', () => {
  /*有本地待同步正文时，远端任何内容变化都不应覆盖用户输入。 */
  const shouldRehydrate = shouldRehydrateEditorSession({
    document: buildDocument({ body_html: '<p>远端新内容</p>' }),
    pendingBodyHtml: '<p>本地待同步正文</p>',
    currentSnapshot: buildEditorDocumentSnapshot('<p>本地待同步正文</p>'),
    baselineBodyHtml: '<p>服务端原始</p>',
    visibleMediaAssets: [],
    hasConfirmedLocalEdit: false,
  });

  assert.equal(shouldRehydrate, false);
});

// ============================================================================
// mergeVisibleMediaAssets
// ============================================================================

test('mergeVisibleMediaAssets 保持服务端顺序并在末尾追加运行态新增素材', () => {
  /*服务端顺序是用户排版意图，运行态新增图片追加到末尾。 */
  const serverAssets = [buildAsset('server-1'), buildAsset('server-2')];
  const runtimeAssets = [buildAsset('server-1'), buildAsset('runtime-3')];

  const merged = mergeVisibleMediaAssets(serverAssets, runtimeAssets);

  assert.deepEqual(
    merged.map((a: EditorMediaAsset) => a.id),
    ['server-1', 'server-2', 'runtime-3']
  );
});

test('mergeVisibleMediaAssets 对 null 服务端素材安全降级', () => {
  /*初始化阶段服务端还未返回素材时，仅保留运行态已上传素材。 */
  const merged = mergeVisibleMediaAssets(null, [buildAsset('runtime-1')]);
  assert.deepEqual(
    merged.map((a: EditorMediaAsset) => a.id),
    ['runtime-1']
  );
});

test('mergeVisibleMediaAssets 不重复已存在于服务端列表中的运行态素材', () => {
  const asset = buildAsset('shared-id');
  const merged = mergeVisibleMediaAssets([asset], [asset]);
  assert.equal(merged.length, 1);
});

// ============================================================================
// shouldCommitOptimisticDocument
// ============================================================================

test('shouldCommitOptimisticDocument 正文和素材均未变化时返回 false', () => {
  /*未发生实质变化不应触发乐观更新，避免不必要的 UI 刷新。 */
  const html = '<p>正文</p>';
  const document = buildDocument({ body_html: html, media_assets: [] });
  const snapshot: EditorDocumentSnapshot = buildEditorDocumentSnapshot(html);

  assert.equal(shouldCommitOptimisticDocument(document, snapshot, []), false);
});

test('shouldCommitOptimisticDocument 正文变化时返回 true', () => {
  const document = buildDocument({ body_html: '<p>旧正文</p>', media_assets: [] });
  const snapshot = buildEditorDocumentSnapshot('<p>新正文</p>');

  assert.equal(shouldCommitOptimisticDocument(document, snapshot, []), true);
});

test('shouldCommitOptimisticDocument 素材列表变化时返回 true', () => {
  const html = '<p>正文</p>';
  const document = buildDocument({ body_html: html, media_assets: [] });
  const snapshot = buildEditorDocumentSnapshot(html);

  assert.equal(
    shouldCommitOptimisticDocument(document, snapshot, [buildAsset('new-asset')]),
    true
  );
});
