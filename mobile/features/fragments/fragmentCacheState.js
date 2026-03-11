import { extractPlainTextFromMarkdown, normalizeBodyMarkdown } from './bodyMarkdown.js';

export const FRAGMENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isFragmentCacheExpired(cachedAt, now = Date.now()) {
  if (typeof cachedAt !== 'string' || !cachedAt.trim()) return true;
  const timestamp = Date.parse(cachedAt);
  if (Number.isNaN(timestamp)) return true;
  return now - timestamp > FRAGMENT_CACHE_TTL_MS;
}

export function sanitizeFragmentCacheEntry(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return null;
  if (!entry.fragment || typeof entry.fragment !== 'object') return null;
  if (isFragmentCacheExpired(entry.cachedAt, now)) return null;
  return {
    fragment: entry.fragment,
    cachedAt: entry.cachedAt,
  };
}

export function sanitizeFragmentListCacheEntry(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return null;
  if (!Array.isArray(entry.items)) return null;
  if (isFragmentCacheExpired(entry.cachedAt, now)) return null;
  return {
    items: entry.items,
    cachedAt: entry.cachedAt,
  };
}

export function mergeFragmentIntoListItems(items, fragment) {
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

export function removeFragmentFromListItems(items, fragmentId) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item && item.id !== fragmentId);
}

export function applyDraftToFragment(fragment, draftMarkdown) {
  if (!fragment || typeof fragment !== 'object') return null;
  const normalizedDraft = normalizeBodyMarkdown(draftMarkdown);
  if (!normalizedDraft) return fragment;
  return {
    ...fragment,
    body_markdown: normalizedDraft,
    plain_text_snapshot: extractPlainTextFromMarkdown(normalizedDraft),
  };
}
