/**
 * Fragment 状态管理 Store
 * 替代手动 Map 缓存 + pub/sub 模式，提供自动响应式更新
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { Fragment } from '@/types/fragment';

/*列表缓存键，支持按文件夹分组*/
const ALL_FOLDERS_KEY = '__all__' as const;
type ListCacheKey = string;

/*缓存大小限制*/
const MAX_DETAIL_CACHE_SIZE = 50;

export interface FragmentState {
  /*详情缓存：替代 detailMemoryCache*/
  detailCache: Map<string, Fragment>;

  /*列表缓存：按文件夹 ID 缓存列表*/
  listCache: Map<ListCacheKey, Fragment[]>;
}

export interface FragmentActions {
  /*详情操作*/
  setDetail: (id: string, fragment: Fragment | null) => void;
  getDetail: (id: string) => Fragment | undefined;
  deleteDetail: (id: string) => void;

  /*列表操作*/
  setList: (folderId: string | null, fragments: Fragment[]) => void;
  getList: (folderId: string | null) => Fragment[] | undefined;
  deleteList: (folderId: string | null) => void;
  removeFragmentFromLists: (fragmentId: string) => void;

  /*批量更新（从 SQLite 同步后调用）*/
  batchUpdateDetails: (fragments: Fragment[]) => void;

  /*清空缓存（退出登录等场景）*/
  clearCache: () => void;
}

export type FragmentStore = FragmentState & FragmentActions;

/*辅助函数：生成列表缓存键*/
function getListCacheKey(folderId: string | null): ListCacheKey {
  return folderId ?? ALL_FOLDERS_KEY;
}

/*辅助函数：通用的不可变 Map 更新，支持变更检测*/
function updateMapState<K, V>(
  map: Map<K, V>,
  key: K,
  value: V | null | undefined,
  isEqual?: (a: V, b: V) => boolean
): Map<K, V> | null {
  const current = map.get(key);

  /*变更检测：值未改变时返回 null 表示无需更新*/
  if (value !== null && value !== undefined) {
    if (current && isEqual && isEqual(current, value)) {
      return null;
    }
    if (current === value) {
      return null;
    }
  } else {
    /*删除操作：键不存在时无需更新*/
    if (!current) {
      return null;
    }
  }

  /*创建新 Map 并应用更新*/
  const next = new Map(map);
  if (value !== null && value !== undefined) {
    next.set(key, value);

    /*LRU 淘汰：超过限制时删除最旧的条目*/
    if (next.size > MAX_DETAIL_CACHE_SIZE) {
      const keys = Array.from(next.keys());
      for (let i = 0; i < next.size - MAX_DETAIL_CACHE_SIZE; i++) {
        next.delete(keys[i]);
      }
    }
  } else {
    next.delete(key);
  }

  return next;
}

/*列表比较除了看 ID，也要感知内容版本变化，避免标题/正文更新后列表不重渲染。 */
function isSameFragmentList(a: Fragment[], b: Fragment[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (fragment, index) =>
        fragment.id === b[index]?.id &&
        fragment.updated_at === b[index]?.updated_at &&
        fragment.media_pipeline_status === b[index]?.media_pipeline_status &&
        fragment.media_pipeline_error_message === b[index]?.media_pipeline_error_message
    )
  );
}

export const useFragmentStore = create<FragmentStore>()(
  devtools(
    (set, get) => ({
      /*初始状态*/
      detailCache: new Map(),
      listCache: new Map(),

      /*详情操作*/
      setDetail: (id, fragment) => {
        set(
          (state) => {
            const next = updateMapState(state.detailCache, id, fragment);
            /*变更检测：未改变时返回原状态，避免通知订阅者*/
            return next ? { detailCache: next } : state;
          },
          false,
          'setDetail'
        );
      },

      getDetail: (id) => {
        return get().detailCache.get(id);
      },

      deleteDetail: (id) => {
        set(
          (state) => {
            const next = updateMapState(state.detailCache, id, null);
            return next ? { detailCache: next } : state;
          },
          false,
          'deleteDetail'
        );
      },

      /*列表操作*/
      setList: (folderId, fragments) => {
        const key = getListCacheKey(folderId);
        set(
          (state) => {
            const next = updateMapState(
              state.listCache,
              key,
              fragments,
              isSameFragmentList
            );
            return next ? { listCache: next } : state;
          },
          false,
          'setList'
        );
      },

      getList: (folderId) => {
        const key = getListCacheKey(folderId);
        return get().listCache.get(key);
      },

      deleteList: (folderId) => {
        const key = getListCacheKey(folderId);
        set(
          (state) => {
            const next = updateMapState(state.listCache, key, null);
            return next ? { listCache: next } : state;
          },
          false,
          'deleteList'
        );
      },

      removeFragmentFromLists: (fragmentId) => {
        set(
          (state) => {
            /*按 id 裁剪所有列表缓存，避免删除单条碎片时把当前列表整表清空。 */
            const nextListCache = new Map(state.listCache);
            let didChange = false;

            for (const [key, fragments] of nextListCache.entries()) {
              const filtered = fragments.filter((fragment) => fragment.id !== fragmentId);
              if (filtered.length === fragments.length) {
                continue;
              }
              nextListCache.set(key, filtered);
              didChange = true;
            }

            return didChange ? { listCache: nextListCache } : state;
          },
          false,
          'removeFragmentFromLists'
        );
      },

      /*批量更新*/
      batchUpdateDetails: (fragments) => {
        set(
          (state) => {
            const next = new Map(state.detailCache);
            fragments.forEach((fragment) => {
              next.set(fragment.id, fragment);
            });

            /*LRU 淘汰：超过限制时删除最旧的条目*/
            if (next.size > MAX_DETAIL_CACHE_SIZE) {
              const keys = Array.from(next.keys());
              for (let i = 0; i < next.size - MAX_DETAIL_CACHE_SIZE; i++) {
                next.delete(keys[i]);
              }
            }

            return { detailCache: next };
          },
          false,
          'batchUpdateDetails'
        );
      },

      /*清空缓存*/
      clearCache: () => {
        set(
          {
            detailCache: new Map(),
            listCache: new Map(),
          },
          false,
          'clearCache'
        );
      },
    }),
    { name: 'FragmentStore' }
  )
);

/*选择器 hooks - 优化性能，避免不必要的重渲染*/

export const useFragmentDetail = (id: string) =>
  useFragmentStore((state) => state.detailCache.get(id));

export const useFragmentList = (folderId: string | null) =>
  useFragmentStore((state) => state.listCache.get(folderId ?? '__all__'));
