import type { Fragment } from '@/types/fragment';

export interface FragmentCacheEntry {
  fragment: Fragment;
  cachedAt: string;
}

export interface FragmentListCacheEntry {
  items: Fragment[];
  cachedAt: string;
}

export declare const FRAGMENT_CACHE_TTL_MS: number;

export declare function isFragmentCacheExpired(cachedAt: string | null | undefined, now?: number): boolean;
export declare function sanitizeFragmentCacheEntry(
  entry: FragmentCacheEntry | null | undefined,
  now?: number
): FragmentCacheEntry | null;
export declare function sanitizeFragmentListCacheEntry(
  entry: FragmentListCacheEntry | null | undefined,
  now?: number
): FragmentListCacheEntry | null;
export declare function mergeFragmentIntoListItems(items: Fragment[], fragment: Fragment): Fragment[];
export declare function removeFragmentFromListItems(items: Fragment[], fragmentId: string): Fragment[];
export declare function applyDraftToFragment(fragment: Fragment | null, draftMarkdown: string | null): Fragment | null;
