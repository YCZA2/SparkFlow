import { useEffect, useState } from 'react';

import { listLocalScriptsBySourceFragment } from '@/features/scripts/store';
import type { Fragment } from '@/types/fragment';

/*统计当前碎片关联的本地成稿数量，供更多抽屉展示下游关系。 */
export function useRelatedScriptsCount(
  fragmentId?: string | null,
  updatedAt?: string | null,
  isSheetOpen?: boolean
) {
  const [relatedScriptsCount, setRelatedScriptsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const nextFragmentId = fragmentId ?? null;

    if (!nextFragmentId) {
      setRelatedScriptsCount(0);
      return;
    }

    void (async () => {
      try {
        const scripts = await listLocalScriptsBySourceFragment(nextFragmentId);
        if (!cancelled) {
          setRelatedScriptsCount(scripts.length);
        }
      } catch {
        if (!cancelled) {
          setRelatedScriptsCount(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fragmentId, isSheetOpen, updatedAt]);

  return relatedScriptsCount;
}

/*把 fragment 真值映射成抽屉内容载荷，供 UI section 直接消费。 */
export function buildFragmentDetailSheetContent(fragment: Fragment | null) {
  if (!fragment) return null;

  return {
    audioFileUrl: fragment.audio_file_url,
    transcript: fragment.transcript,
    speakerSegments: fragment.speaker_segments,
    summary: fragment.summary,
    tags: fragment.tags,
  };
}

/*把 fragment 真值映射成抽屉元信息，避免页面层重复组装展示文案。 */
export function buildFragmentDetailSheetMetadata(
  fragment: Fragment | null,
  relatedScriptsCount: number
) {
  if (!fragment) return null;

  return {
    source: fragment.source,
    audioSource: fragment.audio_source ?? null,
    createdAt: fragment.created_at,
    folderName: fragment.folder?.name ?? '未归档',
    isFilmed: fragment.is_filmed ?? false,
    relatedScriptsCount,
  };
}
