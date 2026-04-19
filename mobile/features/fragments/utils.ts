export function normalizeFragmentTags(tags: string[] | null | undefined): string[] {
  if (!tags) return [];
  return tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
}
