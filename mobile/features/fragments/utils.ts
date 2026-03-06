export function normalizeFragmentTags(tags: string[] | string | null | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
  }

  const trimmed = tags.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
      }
    } catch {
      // Fall back to comma-separated parsing for backward compatibility.
    }
  }

  return trimmed.split(',').map((tag) => tag.trim()).filter(Boolean);
}
