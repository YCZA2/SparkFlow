import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import { consumePendingFragmentCleanup } from '@/features/fragments/cleanup/runtime';
import {
  getFragmentAdditionAnimationDuration,
  getFragmentRemovalAnimationDuration,
} from '@/features/fragments/components/AnimatedFragmentListItem';
import { buildFragmentSections, type FragmentSection } from '@/features/fragments/fragmentListState';
import { useFragmentSelection } from '@/features/fragments/hooks';
import { useFragments } from '@/features/fragments/hooks/useFragments';
import { listLocalFragmentEntities } from '@/features/fragments/store';
import { getEffectiveFragmentTags } from '@/features/fragments/semantics';
import { useSingleFlightRouterPush } from '@/hooks/useSingleFlightRouterPush';
import type { Fragment } from '@/types/fragment';

interface UseFragmentListScreenStateOptions {
  folderId?: string | null;
  folderName?: string | null;
  enableRefreshParam?: boolean;
}

export interface FragmentListScreenState {
  fragments: Fragment[];
  sections: FragmentSection[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  total: number;
  totalLabel: string;
  availableTags: string[];
  activeTag: string | null;
  selection: ReturnType<typeof useFragmentSelection>;
  appearingFragmentIds: Set<string>;
  removingFragmentIds: Set<string>;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  onFragmentPress: (fragment: Fragment) => void;
  onGenerate: () => Promise<void>;
  setActiveTag: (tag: string | null) => void;
}

export function useFragmentListScreenState({
  folderId,
  folderName,
  enableRefreshParam = false,
}: UseFragmentListScreenStateOptions = {}): FragmentListScreenState {
  /*统一首页与文件夹页的碎片列表 view-model，避免页面各写一套选择与跳转逻辑。 */
  const router = useRouter();
  const isFocused = useIsFocused();
  const pushOnce = useSingleFlightRouterPush();
  const params = useLocalSearchParams<{ refresh?: string }>();
  const { fragments, isLoading, isRefreshing, error, refreshFragments, fetchFragments } =
    useFragments({ folderId });
  const selection = useFragmentSelection(20);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const animationScopeKey = folderId?.trim() || '__all__';
  const animationScopeRef = useRef<string | null>(null);
  const knownFragmentIdsRef = useRef<Set<string> | null>(null);
  const pendingAppearingFragmentIdsRef = useRef<Set<string>>(new Set());
  const additionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [appearingFragmentIds, setAppearingFragmentIds] = useState<Set<string>>(new Set());
  const [removingFragmentIds, setRemovingFragmentIds] = useState<Set<string>>(new Set());

  const availableTags = useMemo(() => {
    /*从当前列表里的有效标签生成筛选项，用户标签和未删除系统标签都可命中。 */
    const tags: string[] = [];
    for (const fragment of fragments) {
      for (const tag of getEffectiveFragmentTags(fragment)) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
    return tags.slice(0, 12);
  }, [fragments]);
  const visibleFragments = useMemo(() => {
    /*标签筛选只影响当前页面展示和生成入口上下文，不修改碎片本身。 */
    if (!activeTag) {
      return fragments;
    }
    return fragments.filter((fragment) => getEffectiveFragmentTags(fragment).includes(activeTag));
  }, [activeTag, fragments]);
  const sections = useMemo(() => buildFragmentSections(visibleFragments), [visibleFragments]);

  const scheduleAppearingFragments = useCallback((fragmentIds: string[]) => {
    /*新增卡片动画只标记对应 id，动画完成后及时清理临时状态。 */
    if (fragmentIds.length === 0) {
      return;
    }
    setAppearingFragmentIds((prev) => {
      const next = new Set(prev);
      for (const fragmentId of fragmentIds) {
        next.add(fragmentId);
      }
      return next;
    });

    for (const fragmentId of fragmentIds) {
      const existingTimer = additionTimersRef.current.get(fragmentId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      const timer = setTimeout(() => {
        additionTimersRef.current.delete(fragmentId);
        setAppearingFragmentIds((prev) => {
          if (!prev.has(fragmentId)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(fragmentId);
          return next;
        });
      }, getFragmentAdditionAnimationDuration());
      additionTimersRef.current.set(fragmentId, timer);
    }
  }, []);

  useEffect(() => {
    /*只给已有列表之后新增出现的卡片做入场，初次加载不批量播放动画。 */
    const nextIds = new Set(visibleFragments.map((fragment) => fragment.id));
    if (animationScopeRef.current !== animationScopeKey) {
      animationScopeRef.current = animationScopeKey;
      knownFragmentIdsRef.current = nextIds;
      for (const timer of additionTimersRef.current.values()) {
        clearTimeout(timer);
      }
      additionTimersRef.current.clear();
      pendingAppearingFragmentIdsRef.current.clear();
      setAppearingFragmentIds(new Set());
      return;
    }

    const previousIds = knownFragmentIdsRef.current;
    knownFragmentIdsRef.current = nextIds;

    if (previousIds === null) {
      return;
    }

    const addedIds = visibleFragments
      .map((fragment) => fragment.id)
      .filter((fragmentId) => !previousIds.has(fragmentId));
    if (addedIds.length === 0) {
      return;
    }

    if (!isFocused) {
      for (const fragmentId of addedIds) {
        pendingAppearingFragmentIdsRef.current.add(fragmentId);
      }
      return;
    }

    scheduleAppearingFragments(addedIds);
  }, [animationScopeKey, visibleFragments, isFocused, scheduleAppearingFragments]);

  useEffect(() => {
    if (!isFocused || pendingAppearingFragmentIdsRef.current.size === 0) {
      return;
    }
    const visibleIds = new Set(visibleFragments.map((fragment) => fragment.id));
    const addedIds = Array.from(pendingAppearingFragmentIdsRef.current).filter((fragmentId) =>
      visibleIds.has(fragmentId)
    );
    pendingAppearingFragmentIdsRef.current.clear();
    scheduleAppearingFragments(addedIds);
  }, [visibleFragments, isFocused, scheduleAppearingFragments]);

  useEffect(() => {
    return () => {
      for (const timer of additionTimersRef.current.values()) {
        clearTimeout(timer);
      }
      additionTimersRef.current.clear();
    };
  }, []);

  const markFragmentRemoving = useCallback((fragmentId: string) => {
    /*列表退场动画期间单独记录正在移除的 item，避免把展示态耦合进 store。 */
    setRemovingFragmentIds((prev) => {
      if (prev.has(fragmentId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(fragmentId);
      return next;
    });
  }, []);

  const unmarkFragmentRemoving = useCallback((fragmentId: string) => {
    /*删除结束或失败后移除退场标记，防止后续列表复用旧动画状态。 */
    setRemovingFragmentIds((prev) => {
      if (!prev.has(fragmentId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(fragmentId);
      return next;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!enableRefreshParam || params.refresh !== 'true') return;
      void fetchFragments();
      router.setParams({ refresh: undefined });
    }, [enableRefreshParam, fetchFragments, params.refresh, router])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const consumePendingCleanup = async () => {
        try {
          await consumePendingFragmentCleanup({
            readVisibleFragments: () => listLocalFragmentEntities(folderId),
            shouldCancel: () => cancelled,
            onDeleteStart: async (fragmentId, resolution) => {
              if (!resolution.shouldAnimate) {
                return;
              }
              markFragmentRemoving(fragmentId);
              await new Promise((resolve) =>
                setTimeout(resolve, getFragmentRemovalAnimationDuration())
              );
            },
            onDeleteComplete: async () => {
              if (!cancelled) {
                await fetchFragments();
              }
            },
            onDeleteSettled: (fragmentId) => {
              if (!cancelled) {
                unmarkFragmentRemoving(fragmentId);
              }
            },
          });
        } catch {
          /*清理失败时保留 ticket，等待下一次聚焦继续重试。 */
        }
      };

      void consumePendingCleanup();

      return () => {
        cancelled = true;
      };
    }, [fetchFragments, folderId, markFragmentRemoving, unmarkFragmentRemoving])
  );

  const onFragmentPress = useCallback(
    (fragment: Fragment) => {
      if (selection.isSelectionMode) {
        // 所有碎片都可以被选择，无论同步状态
        const accepted = selection.toggleSelect(fragment.id);
        if (!accepted) {
          Alert.alert('已达上限', `最多选择 ${selection.maxSelection} 条碎片`);
        }
        return;
      }

      /*非选择态下通过导航去重保护详情跳转，避免快速连点重复打开同一正文页。 */
      pushOnce(
        {
          pathname: '/fragment/[id]' as const,
          params: { id: fragment.id, ...(folderId ? { folderId, folderName: folderName || '' } : {}) },
        },
        `fragment:${fragment.id}`
      );
    },
    [pushOnce, selection, folderId, folderName]
  );

  const onGenerate = useCallback(async () => {
    // 使用 Set 优化查找性能
    const selectedIdSet = new Set(selection.selectedIds);
    const selectedFragments = visibleFragments.filter((item) => selectedIdSet.has(item.id));

    const fragmentIds = selectedFragments.map((item) => item.id).filter(Boolean);

    router.push({
      pathname: '/generate',
      params: {
        ...(fragmentIds.length > 0 ? { fragmentIds: fragmentIds.join(',') } : {}),
        ...(folderId ? { folderId } : {}),
        ...(activeTag ? { tagFilters: activeTag } : {}),
      },
    });
  }, [activeTag, folderId, router, selection.selectedIds, visibleFragments]);

  return {
    fragments: visibleFragments,
    sections,
    isLoading,
    isRefreshing,
    error,
    total: visibleFragments.length,
    totalLabel: activeTag ? `${visibleFragments.length} 条灵感 · ${activeTag}` : `${visibleFragments.length} 条灵感`,
    availableTags,
    activeTag,
    selection,
    appearingFragmentIds,
    removingFragmentIds,
    refresh: refreshFragments,
    reload: fetchFragments,
    onFragmentPress,
    onGenerate,
    setActiveTag,
  };
}
