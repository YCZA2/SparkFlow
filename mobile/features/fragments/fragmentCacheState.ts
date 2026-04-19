import type { Fragment } from '@/types/fragment';

import { extractPlainTextFromHtml, normalizeBodyHtml } from '@/features/editor/html';

export function applyPendingBodyToFragment(fragment: Fragment | null, pendingBodyHtml: string | null): Fragment | null {
  /*仅把待保存正文叠加到展示态 fragment，不覆盖本地镜像里的持久化基线。 */
  if (!fragment || typeof fragment !== 'object') return null;
  const normalizedBody = normalizeBodyHtml(pendingBodyHtml);
  if (!normalizedBody) return fragment;
  return {
    ...fragment,
    body_html: normalizedBody,
    plain_text_snapshot: extractPlainTextFromHtml(normalizedBody),
  };
}
