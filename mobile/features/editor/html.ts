export interface HtmlPatch {
  op: 'replace_selection' | 'insert_after_selection' | 'prepend_document';
  html_snippet: string;
}

const ASSET_REF_PATTERN = /<img[^>]+src=["']asset:\/\/([^"']+)["'][^>]*>/gi;

export function normalizeBodyHtml(html: string | null | undefined): string {
  /*规整正文 HTML，统一换行并去掉首尾空白。 */
  return String(html ?? '').replace(/\r\n/g, '\n').trim();
}

export function stripEdgeEmptyParagraphs(html: string): string {
  /*去除正文首尾的空段落，避免编辑器初始化时插入的空 <p> 节点污染持久化内容或初始展示。 */
  return html
    .replace(/^(<p[^>]*>\s*<\/p>\s*)+/, '')
    .replace(/(\s*<p[^>]*>\s*<\/p>)+$/, '');
}

export function extractPlainTextFromHtml(html: string | null | undefined): string {
  /*从 HTML 中提取纯文本快照，供列表预览和分享复用。 */
  const normalized = normalizeBodyHtml(html);
  if (!normalized) return '';
  return normalized
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote|li|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractAssetIdsFromHtml(html: string | null | undefined): string[] {
  /*从 HTML 中提取 asset:// 图片引用，保持顺序并去重。 */
  const normalized = normalizeBodyHtml(html);
  const assetIds: string[] = [];
  for (const match of normalized.matchAll(ASSET_REF_PATTERN)) {
    const assetId = String(match[1] ?? '').trim();
    if (assetId && !assetIds.includes(assetId)) assetIds.push(assetId);
  }
  return assetIds;
}

export function createImageHtml(assetId: string, alt = ''): string {
  /*把图片资产稳定渲染为编辑器可恢复的 img 节点。 */
  const safeAlt = alt.replace(/"/g, '&quot;');
  return `<img src="asset://${assetId}" alt="${safeAlt}" />`;
}

export function convertPlainTextToHtml(text: string | null | undefined): string {
  /*把纯文本稳定转换成基础 HTML，供转写内容首次落为可编辑正文。 */
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.split('\n').map(escapeHtml).join('<br />')}</p>`)
    .join('\n');
}

export function applyHtmlPatchToBody(
  currentHtml: string,
  patch: HtmlPatch,
  _selectionText: string
): string {
  /*保留最小 HTML patch 能力，兼容历史纯状态测试。 */
  const normalizedCurrentHtml = normalizeBodyHtml(currentHtml);
  const normalizedSnippet = normalizeBodyHtml(patch.html_snippet);
  if (!normalizedSnippet) return normalizedCurrentHtml;
  if (!normalizedCurrentHtml) return normalizedSnippet;
  if (patch.op === 'replace_selection') return normalizedSnippet;
  if (patch.op === 'prepend_document') {
    return normalizeBodyHtml(`${normalizedSnippet}\n${normalizedCurrentHtml}`);
  }
  return normalizeBodyHtml(`${normalizedCurrentHtml}\n${normalizedSnippet}`);
}
