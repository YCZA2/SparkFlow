import type { Fragment } from '@/types/fragment';

import { extractPlainTextFromHtml, normalizeBodyHtml } from './bodyMarkdown';

export function applyDraftToFragment(fragment: Fragment | null, draftHtml: string | null): Fragment | null {
  /*仅把本地草稿叠加到展示态 fragment，不覆盖本地镜像里的远端基线。 */
  if (!fragment || typeof fragment !== 'object') return null;
  const normalizedDraft = normalizeBodyHtml(draftHtml);
  if (!normalizedDraft) return fragment;
  return {
    ...fragment,
    body_html: normalizedDraft,
    plain_text_snapshot: extractPlainTextFromHtml(normalizedDraft),
  };
}
