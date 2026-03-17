import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLegacyDraftHtml } from '../features/fragments/store/legacyMigrationUtils';

test('resolveLegacyDraftHtml prefers html over markdown and normalizes whitespace', () => {
  assert.equal(
    resolveLegacyDraftHtml({
      html: '  <p>正文</p>\r\n',
      markdown: '# 标题',
    }),
    '<p>正文</p>'
  );
});

test('resolveLegacyDraftHtml falls back to markdown when html is absent', () => {
  assert.equal(
    resolveLegacyDraftHtml({
      markdown: '  # 标题  ',
    }),
    '# 标题'
  );
});
