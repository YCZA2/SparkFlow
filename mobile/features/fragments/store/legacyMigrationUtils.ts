import { normalizeBodyHtml } from '@/features/editor/html';

/*规范化 legacy 草稿正文，兼容旧 html/markdown 双字段。 */
export function resolveLegacyDraftHtml(raw: { html?: string; markdown?: string }): string {
  return normalizeBodyHtml(raw.html ?? raw.markdown ?? '');
}
