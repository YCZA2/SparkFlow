import { useLocalScriptListQuery } from '@/features/scripts/queries';
import type { Fragment } from '@/types/fragment';

/*统计当前碎片关联的本地成稿数量，供更多抽屉展示下游关系。 */
export function useRelatedScriptsCount(
  fragmentId?: string | null,
  updatedAt?: string | null,
  isSheetOpen?: boolean
) {
  /*抽屉里的关联成稿计数也复用 query 数据，避免再维护一套 effect + state。 */
  const query = useLocalScriptListQuery({
    sourceFragmentId: fragmentId ?? null,
  });

  if (!fragmentId) {
    return 0;
  }
  return query.data?.length ?? 0;
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
    systemPurpose: fragment.system_purpose ?? null,
    userPurpose: fragment.user_purpose ?? null,
    effectivePurpose: fragment.effective_purpose ?? 'other',
    systemTags: fragment.system_tags ?? fragment.tags ?? [],
    userTags: fragment.user_tags ?? [],
    dismissedSystemTags: fragment.dismissed_system_tags ?? [],
    effectiveTags: fragment.effective_tags ?? fragment.tags ?? [],
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
