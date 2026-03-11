import type { FragmentAiPatch } from '@/types/fragment';

const ASSET_REF_PATTERN = /!\[[^\]]*\]\(asset:\/\/([^)]+)\)/g;

export function normalizeBodyMarkdown(markdown: string | null | undefined): string {
  /** 中文注释：规整正文 Markdown，统一换行并去掉首尾空白。 */
  return String(markdown ?? '').replace(/\r\n/g, '\n').trim();
}

export function extractPlainTextFromMarkdown(markdown: string | null | undefined): string {
  /** 中文注释：从 Markdown 中提取纯文本快照，供列表预览和保存状态复用。 */
  const normalized = normalizeBodyMarkdown(markdown);
  if (!normalized) return '';
  return normalized
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractAssetIdsFromMarkdown(markdown: string | null | undefined): string[] {
  /** 中文注释：从 Markdown 中提取 asset:// 图片引用，保持顺序并去重。 */
  const normalized = normalizeBodyMarkdown(markdown);
  const assetIds: string[] = [];
  for (const match of normalized.matchAll(ASSET_REF_PATTERN)) {
    const assetId = String(match[1] ?? '').trim();
    if (assetId && !assetIds.includes(assetId)) assetIds.push(assetId);
  }
  return assetIds;
}

export function applyAiPatchToMarkdown(
  currentMarkdown: string,
  patch: FragmentAiPatch,
  selectionText: string
): string {
  /** 中文注释：在桥接不可用时退化为基于字符串的 Markdown patch 应用。 */
  const current = normalizeBodyMarkdown(currentMarkdown);
  const snippet = normalizeBodyMarkdown(patch.markdown_snippet);
  if (!snippet) return current;

  if (patch.op === 'prepend_document') {
    return current ? `${snippet}\n\n${current}` : snippet;
  }

  if (patch.op === 'insert_after_selection') {
    const focus = selectionText.trim();
    if (!focus) return current ? `${current}\n\n${snippet}` : snippet;
    const index = current.indexOf(focus);
    if (index < 0) return current ? `${current}\n\n${snippet}` : snippet;
    const insertionPoint = index + focus.length;
    return normalizeBodyMarkdown(`${current.slice(0, insertionPoint)}\n\n${snippet}${current.slice(insertionPoint)}`);
  }

  const focus = selectionText.trim();
  if (!focus) return snippet;
  const index = current.indexOf(focus);
  if (index < 0) return snippet;
  return normalizeBodyMarkdown(`${current.slice(0, index)}${snippet}${current.slice(index + focus.length)}`);
}
