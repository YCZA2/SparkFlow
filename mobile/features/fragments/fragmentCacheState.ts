import type { Fragment } from '@/types/fragment';

import { extractPlainTextFromHtml, normalizeBodyHtml } from './bodyMarkdown';

export interface FragmentCacheEntry {
  fragment: Fragment;
  cachedAt: string;
}

export interface FragmentListCacheEntry {
  items: Fragment[];
  cachedAt: string;
}

export const FRAGMENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isFragmentCacheExpired(cachedAt: string | null | undefined, now = Date.now()): boolean {
  /*统一判断缓存是否过期，避免 detail/list 使用不同 TTL 规则。 */
  if (typeof cachedAt !== 'string' || !cachedAt.trim()) return true;
  const timestamp = Date.parse(cachedAt);
  if (Number.isNaN(timestamp)) return true;
  return now - timestamp > FRAGMENT_CACHE_TTL_MS;
}

export function sanitizeFragmentCacheEntry(
  entry: FragmentCacheEntry | null | undefined,
  now = Date.now()
): FragmentCacheEntry | null {
  /*读取详情缓存时剔除非法或过期快照，避免脏数据污染编辑链路。 */
  if (!entry || typeof entry !== 'object') return null;
  if (!entry.fragment || typeof entry.fragment !== 'object') return null;
  if (isFragmentCacheExpired(entry.cachedAt, now)) return null;
  return {
    fragment: entry.fragment,
    cachedAt: entry.cachedAt,
  };
}

export function sanitizeFragmentListCacheEntry(
  entry: FragmentListCacheEntry | null | undefined,
  now = Date.now()
): FragmentListCacheEntry | null {
  /*读取列表缓存时统一做结构校验，避免列表秒开时崩溃。 */
  if (!entry || typeof entry !== 'object') return null;
  if (!Array.isArray(entry.items)) return null;
  if (isFragmentCacheExpired(entry.cachedAt, now)) return null;
  return {
    items: entry.items,
    cachedAt: entry.cachedAt,
  };
}

export function mergeFragmentIntoListItems(items: Fragment[], fragment: Fragment): Fragment[] {
  /*把单条详情快照合并回列表缓存，保持列表预览同步。 */
  if (!Array.isArray(items)) return fragment ? [fragment] : [];
  if (!fragment || typeof fragment !== 'object' || !fragment.id) return [...items];
  const nextItems = items.filter((item) => item && item.id !== fragment.id);
  const existingIndex = items.findIndex((item) => item && item.id === fragment.id);
  if (existingIndex < 0) {
    return [fragment, ...nextItems];
  }
  nextItems.splice(existingIndex, 0, fragment);
  return nextItems;
}

function resolveFragmentBodyLength(fragment: Fragment | null | undefined): number {
  /*按正文纯文本长度比较详情快照完整度，避免空快照覆盖已有内容。 */
  if (!fragment) return 0;
  const bodyText = extractPlainTextFromHtml(fragment.body_html);
  if (bodyText) return bodyText.length;
  return String(fragment.plain_text_snapshot ?? '').trim().length;
}

export function mergeFragmentDetailForPrewarm(
  existing: Fragment | null | undefined,
  incoming: Fragment
): Fragment {
  /*列表预热详情缓存时优先保留更完整的正文和素材，避免旧列表降级详情。 */
  if (!existing || existing.id !== incoming.id) return incoming;

  const keepExistingBody = resolveFragmentBodyLength(existing) > resolveFragmentBodyLength(incoming);
  const existingMediaAssets = existing.media_assets ?? [];
  const incomingMediaAssets = incoming.media_assets ?? [];
  const keepExistingMediaAssets = existingMediaAssets.length > incomingMediaAssets.length;

  return {
    ...incoming,
    body_html: keepExistingBody ? existing.body_html : incoming.body_html,
    plain_text_snapshot: keepExistingBody
      ? existing.plain_text_snapshot ?? extractPlainTextFromHtml(existing.body_html)
      : incoming.plain_text_snapshot,
    media_assets: keepExistingMediaAssets ? existingMediaAssets : incomingMediaAssets,
  };
}

export function removeFragmentFromListItems(items: Fragment[], fragmentId: string): Fragment[] {
  /*删除详情缓存时同步回收列表项，避免首页残留幽灵卡片。 */
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item && item.id !== fragmentId);
}

export function applyDraftToFragment(fragment: Fragment | null, draftHtml: string | null): Fragment | null {
  /*仅把本地草稿叠加到展示态 fragment，不覆盖服务端快照真值。 */
  if (!fragment || typeof fragment !== 'object') return null;
  const normalizedDraft = normalizeBodyHtml(draftHtml);
  if (!normalizedDraft) return fragment;
  return {
    ...fragment,
    body_html: normalizedDraft,
    plain_text_snapshot: extractPlainTextFromHtml(normalizedDraft),
  };
}
