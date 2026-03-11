const ASSET_REF_PATTERN = /!\[[^\]]*\]\(asset:\/\/([^)]+)\)/g;

export function normalizeBodyMarkdown(markdown) {
  return String(markdown ?? '').replace(/\r\n/g, '\n').trim();
}

export function extractPlainTextFromMarkdown(markdown) {
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

export function extractAssetIdsFromMarkdown(markdown) {
  const normalized = normalizeBodyMarkdown(markdown);
  const assetIds = [];
  for (const match of normalized.matchAll(ASSET_REF_PATTERN)) {
    const assetId = String(match[1] ?? '').trim();
    if (assetId && !assetIds.includes(assetId)) assetIds.push(assetId);
  }
  return assetIds;
}
