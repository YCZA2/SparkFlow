import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { Script } from '@/types/script';

const ALL_SCRIPTS_KEY = '__all__' as const;
const MAX_DETAIL_CACHE_SIZE = 50;

type ListCacheKey = string;

export interface ScriptState {
  /*详情缓存：承接本地 script 真值读取后的内存镜像。 */
  detailCache: Map<string, Script>;
  /*列表缓存：支持全量列表与按来源碎片筛选的成稿列表。 */
  listCache: Map<ListCacheKey, Script[]>;
}

export interface ScriptActions {
  /*详情操作：统一维护单稿缓存。 */
  setDetail: (id: string, script: Script | null) => void;
  getDetail: (id: string) => Script | undefined;
  deleteDetail: (id: string) => void;
  /*列表操作：统一维护不同筛选视图下的成稿列表。 */
  setList: (cacheKey: string | null, scripts: Script[]) => void;
  getList: (cacheKey: string | null) => Script[] | undefined;
  deleteList: (cacheKey: string | null) => void;
  /*批量更新详情缓存，便于 SQLite 同步后一并回填。 */
  batchUpdateDetails: (scripts: Script[]) => void;
  /*在恢复或退出登录时清空所有缓存。 */
  clearCache: () => void;
}

export type ScriptStore = ScriptState & ScriptActions;

function getListCacheKey(cacheKey: string | null): ListCacheKey {
  return cacheKey ?? ALL_SCRIPTS_KEY;
}

function updateMapState<K, V>(
  map: Map<K, V>,
  key: K,
  value: V | null | undefined,
  isEqual?: (a: V, b: V) => boolean
): Map<K, V> | null {
  const current = map.get(key);
  if (value !== null && value !== undefined) {
    if (current && isEqual && isEqual(current, value)) {
      return null;
    }
    if (current === value) {
      return null;
    }
  } else if (!current) {
    return null;
  }

  const next = new Map(map);
  if (value !== null && value !== undefined) {
    next.set(key, value);
    if (next.size > MAX_DETAIL_CACHE_SIZE) {
      const keys = Array.from(next.keys());
      for (let index = 0; index < next.size - MAX_DETAIL_CACHE_SIZE; index += 1) {
        next.delete(keys[index]);
      }
    }
  } else {
    next.delete(key);
  }
  return next;
}

export const useScriptStore = create<ScriptStore>()(
  devtools(
    (set, get) => ({
      detailCache: new Map(),
      listCache: new Map(),

      setDetail: (id, script) => {
        set(
          (state) => {
            const next = updateMapState(state.detailCache, id, script);
            return next ? { detailCache: next } : state;
          },
          false,
          'setScriptDetail'
        );
      },

      getDetail: (id) => get().detailCache.get(id),

      deleteDetail: (id) => {
        set(
          (state) => {
            const next = updateMapState(state.detailCache, id, null);
            return next ? { detailCache: next } : state;
          },
          false,
          'deleteScriptDetail'
        );
      },

      setList: (cacheKey, scripts) => {
        const key = getListCacheKey(cacheKey);
        set(
          (state) => {
            const next = updateMapState(
              state.listCache,
              key,
              scripts,
              (left, right) => left.length === right.length && left.every((item, index) => item.id === right[index]?.id)
            );
            return next ? { listCache: next } : state;
          },
          false,
          'setScriptList'
        );
      },

      getList: (cacheKey) => get().listCache.get(getListCacheKey(cacheKey)),

      deleteList: (cacheKey) => {
        const key = getListCacheKey(cacheKey);
        set(
          (state) => {
            const next = updateMapState(state.listCache, key, null);
            return next ? { listCache: next } : state;
          },
          false,
          'deleteScriptList'
        );
      },

      batchUpdateDetails: (scripts) => {
        set(
          (state) => {
            const next = new Map(state.detailCache);
            scripts.forEach((script) => {
              next.set(script.id, script);
            });
            if (next.size > MAX_DETAIL_CACHE_SIZE) {
              const keys = Array.from(next.keys());
              for (let index = 0; index < next.size - MAX_DETAIL_CACHE_SIZE; index += 1) {
                next.delete(keys[index]);
              }
            }
            return { detailCache: next };
          },
          false,
          'batchUpdateScriptDetails'
        );
      },

      clearCache: () => {
        set(
          {
            detailCache: new Map(),
            listCache: new Map(),
          },
          false,
          'clearScriptCache'
        );
      },
    }),
    { name: 'ScriptStore' }
  )
);

export const useScriptDetail = (id: string) => useScriptStore((state) => state.detailCache.get(id));

export const useScriptList = (cacheKey: string | null) =>
  useScriptStore((state) => state.listCache.get(cacheKey ?? ALL_SCRIPTS_KEY));
