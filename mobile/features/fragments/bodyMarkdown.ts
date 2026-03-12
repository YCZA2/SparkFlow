import type { FragmentAiPatch } from '@/types/fragment';

const ASSET_REF_PATTERN = /<img[^>]+src=["']asset:\/\/([^"']+)["'][^>]*>/gi;

export function normalizeBodyHtml(html: string | null | undefined): string {
  /*规整正文 HTML，统一换行并去掉首尾空白。 */
  return String(html ?? '').replace(/\r\n/g, '\n').trim();
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

export function applyAiPatchToHtml(
  currentHtml: string,
  patch: FragmentAiPatch,
  _selectionText: string
): string {
  /*AI patch 当前仅保留最小 HTML 片段拼接能力，避免旧调用点崩溃。 */
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

/*兼容旧导入名，避免迁移阶段一次性改太多调用点。 */
export const normalizeBodyMarkdown = normalizeBodyHtml;
export const extractPlainTextFromMarkdown = extractPlainTextFromHtml;
export const extractAssetIdsFromMarkdown = extractAssetIdsFromHtml;
export const applyAiPatchToMarkdown = applyAiPatchToHtml;
