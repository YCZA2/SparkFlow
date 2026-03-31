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

export function wrapHtmlForNativeEditor(html: string | null | undefined): string {
  /*把项目正文包装成原生编辑器内部协议，确保 Android 会按 HTML 解析 defaultValue。 */
  const normalized = normalizeBodyHtml(html);
  if (!normalized) {
    return '<html>\n<p></p>\n</html>';
  }
  return `<html>\n${normalized}\n</html>`;
}

export function ensureFirstLineIsTitle(html: string): string {
  /* 把正文首个 <p> 块升格为 <h1>，实现"首行即标题"的编辑体验。
   * 若首块已是 <h1>（或其他非 <p> 块元素）则保持不变；空内容直接返回。
   * 调用时机：编辑器 seed HTML 管道，不影响持久化存储路径。 */
  const normalized = normalizeBodyHtml(html);
  if (!normalized) return normalized;

  // 首块已经是非 <p> 元素（h1-h6、ul、ol、blockquote 等），无需转换
  if (!/^<p[\s>]/i.test(normalized)) return normalized;

  // 把首个 <p>...</p> 替换为 <h1>...</h1>，保留原有属性
  return normalized.replace(/^<p([^>]*)>([\s\S]*?)<\/p>/i, '<h1$1>$2</h1>');
}

export function unwrapHtmlFromNativeEditor(html: string | null | undefined): string {
  /*把原生编辑器返回的内部 HTML 还原为项目正文格式，并剥掉首尾空段落。 */
  const normalized = normalizeBodyHtml(html);
  if (!normalized) return '';
  const unwrapped = normalized
    .replace(/^<html>\s*/i, '')
    .replace(/\s*<\/html>$/i, '');
  return stripEdgeEmptyParagraphs(normalizeBodyHtml(unwrapped));
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

/**
 * 从 HTML 首行提取标题文本。
 * 优先识别第一个 h1 元素；若无则取第一个 p 元素内容的前 50 字。
 * 用于列表卡片显示标题，实现"首行即标题"的产品体验。
 */
export function extractTitleFromFirstLine(html: string | null | undefined, maxTitleLength = 50): string {
  const normalized = normalizeBodyHtml(html);
  if (!normalized) return '';

  // 尝试匹配第一个 h1 元素
  const h1Match = normalized.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    const title = extractPlainTextFromHtml(h1Match[1]).trim();
    if (title) return title.slice(0, maxTitleLength);
  }

  // 尝试匹配第一个 p 元素
  const pMatch = normalized.match(/<p[^>]*>(.*?)<\/p>/i);
  if (pMatch && pMatch[1]) {
    const title = extractPlainTextFromHtml(pMatch[1]).trim();
    if (title) return title.slice(0, maxTitleLength);
  }

  // 兜底：从纯文本首行提取
  const plainText = extractPlainTextFromHtml(normalized);
  const firstLine = plainText.split('\n')[0]?.trim();
  if (firstLine) return firstLine.slice(0, maxTitleLength);

  return '';
}

/**
 * 从 HTML 提取正文预览（跳过首行标题）。
 * 用于列表卡片的预览文本显示，避免标题和预览重复。
 */
export function extractPreviewSkippingTitle(html: string | null | undefined, maxPreviewLength = 100): string {
  const normalized = normalizeBodyHtml(html);
  if (!normalized) return '';

  // 移除首行 h1 或 p 元素
  let previewHtml = normalized;

  // 如果首行是 h1，移除它
  const h1Match = previewHtml.match(/<h1[^>]*>.*?<\/h1>/i);
  if (h1Match) {
    previewHtml = previewHtml.replace(h1Match[0], '');
  } else {
    // 否则移除第一个 p 元素
    const pMatch = previewHtml.match(/<p[^>]*>.*?<\/p>/i);
    if (pMatch) {
      previewHtml = previewHtml.replace(pMatch[0], '');
    }
  }

  const previewText = extractPlainTextFromHtml(previewHtml).trim();
  return previewText.slice(0, maxPreviewLength);
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
