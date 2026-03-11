import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Fragment } from '@/types/fragment';

import {
  mergeFragmentIntoListItems,
  removeFragmentFromListItems,
  sanitizeFragmentCacheEntry,
  sanitizeFragmentListCacheEntry,
} from './fragmentCacheState.js';

export interface FragmentCacheEntry {
  fragment: Fragment;
  cachedAt: string;
}

export interface FragmentListCacheEntry {
  items: Fragment[];
  cachedAt: string;
}

const CACHE_VERSION = 'v1';
const FRAGMENT_DETAIL_PREFIX = `@fragment_cache:${CACHE_VERSION}:detail:`;
const FRAGMENT_LIST_KEY = `@fragment_cache:${CACHE_VERSION}:list`;

const detailMemoryCache = new Map<string, FragmentCacheEntry | null>();
let listMemoryCache: FragmentListCacheEntry | null | undefined;
const listeners = new Set<() => void>();

function buildDetailKey(fragmentId: string): string {
  /** 中文注释：按 fragment 维度隔离详情缓存键，便于单条清理。 */
  return `${FRAGMENT_DETAIL_PREFIX}${fragmentId}`;
}

function emitCacheChange(): void {
  /** 中文注释：本地仓储写入后广播缓存变化，驱动列表和详情即时回显。 */
  listeners.forEach((listener) => listener());
}

function createFragmentCacheEntry(fragment: Fragment): FragmentCacheEntry {
  /** 中文注释：统一包装详情缓存载荷，保证 detail/list 使用相同时间戳语义。 */
  return {
    fragment,
    cachedAt: new Date().toISOString(),
  };
}

function createFragmentListCacheEntry(items: Fragment[]): FragmentListCacheEntry {
  /** 中文注释：统一包装列表缓存载荷，方便后续做 TTL 和版本升级。 */
  return {
    items,
    cachedAt: new Date().toISOString(),
  };
}

async function readPersistedDetailCache(fragmentId: string): Promise<FragmentCacheEntry | null> {
  /** 中文注释：从持久层读取详情缓存，并在过期时主动清理脏数据。 */
  try {
    const raw = await AsyncStorage.getItem(buildDetailKey(fragmentId));
    if (!raw) return null;
    const parsed = sanitizeFragmentCacheEntry(JSON.parse(raw) as FragmentCacheEntry);
    if (!parsed) {
      await AsyncStorage.removeItem(buildDetailKey(fragmentId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function readPersistedListCache(): Promise<FragmentListCacheEntry | null> {
  /** 中文注释：从持久层读取列表缓存，并在过期时回收旧快照。 */
  try {
    const raw = await AsyncStorage.getItem(FRAGMENT_LIST_KEY);
    if (!raw) return null;
    const parsed = sanitizeFragmentListCacheEntry(JSON.parse(raw) as FragmentListCacheEntry);
    if (!parsed) {
      await AsyncStorage.removeItem(FRAGMENT_LIST_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function persistFragmentListEntry(entry: FragmentListCacheEntry | null): Promise<void> {
  /** 中文注释：统一处理列表缓存落盘和内存镜像，避免多处状态漂移。 */
  listMemoryCache = entry;
  if (!entry) {
    await AsyncStorage.removeItem(FRAGMENT_LIST_KEY);
    emitCacheChange();
    return;
  }
  await AsyncStorage.setItem(FRAGMENT_LIST_KEY, JSON.stringify(entry));
  emitCacheChange();
}

async function persistFragmentDetailEntry(fragmentId: string, entry: FragmentCacheEntry | null): Promise<void> {
  /** 中文注释：统一处理详情缓存落盘和内存镜像，避免 detail/list 不一致。 */
  detailMemoryCache.set(fragmentId, entry);
  if (!entry) {
    await AsyncStorage.removeItem(buildDetailKey(fragmentId));
    emitCacheChange();
    return;
  }
  await AsyncStorage.setItem(buildDetailKey(fragmentId), JSON.stringify(entry));
  emitCacheChange();
}

export function subscribeFragmentCache(listener: () => void): () => void {
  /** 中文注释：提供最小订阅接口，让列表和详情在缓存写入后立即刷新。 */
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function peekFragmentCache(fragmentId: string): FragmentCacheEntry | null {
  /** 中文注释：优先从内存读取详情缓存，减少订阅更新时的异步抖动。 */
  return sanitizeFragmentCacheEntry(detailMemoryCache.get(fragmentId) ?? null);
}

export function peekFragmentListCache(): FragmentListCacheEntry | null {
  /** 中文注释：优先从内存读取列表缓存，供订阅更新时直接回显。 */
  return sanitizeFragmentListCacheEntry(listMemoryCache ?? null);
}

export async function readFragmentCache(fragmentId: string): Promise<FragmentCacheEntry | null> {
  /** 中文注释：按需读取详情缓存，首次缺内存时再回落到 AsyncStorage。 */
  const cached = peekFragmentCache(fragmentId);
  if (cached) return cached;
  const persisted = await readPersistedDetailCache(fragmentId);
  detailMemoryCache.set(fragmentId, persisted);
  return persisted;
}

export async function readFragmentListCache(): Promise<FragmentListCacheEntry | null> {
  /** 中文注释：按需读取列表缓存，首次缺内存时再回落到 AsyncStorage。 */
  const cached = peekFragmentListCache();
  if (cached) return cached;
  const persisted = await readPersistedListCache();
  listMemoryCache = persisted;
  return persisted;
}

export async function writeFragmentCache(fragment: Fragment): Promise<void> {
  /** 中文注释：覆盖写入单条详情缓存，并顺手同步列表里的同条快照。 */
  const detailEntry = createFragmentCacheEntry(fragment);
  detailMemoryCache.set(fragment.id, detailEntry);
  await AsyncStorage.setItem(buildDetailKey(fragment.id), JSON.stringify(detailEntry));

  const currentListEntry = (await readFragmentListCache()) ?? createFragmentListCacheEntry([]);
  const nextListEntry = createFragmentListCacheEntry(mergeFragmentIntoListItems(currentListEntry.items, fragment));
  await persistFragmentListEntry(nextListEntry);
}

export async function writeFragmentListCache(items: Fragment[]): Promise<void> {
  /** 中文注释：覆盖写入列表缓存，并预热每条 fragment 的详情缓存。 */
  const entry = createFragmentListCacheEntry(items);
  listMemoryCache = entry;
  await AsyncStorage.setItem(FRAGMENT_LIST_KEY, JSON.stringify(entry));
  await Promise.all(
    items.map(async (fragment) => {
      const detailEntry = createFragmentCacheEntry(fragment);
      detailMemoryCache.set(fragment.id, detailEntry);
      await AsyncStorage.setItem(buildDetailKey(fragment.id), JSON.stringify(detailEntry));
    })
  );
  emitCacheChange();
}

export async function prewarmFragmentDetailCache(fragment: Fragment): Promise<void> {
  /** 中文注释：从列表进入详情前先预热单条缓存，减少首次进入白屏。 */
  await persistFragmentDetailEntry(fragment.id, createFragmentCacheEntry(fragment));
  const currentListEntry = (await readFragmentListCache()) ?? createFragmentListCacheEntry([]);
  const nextItems = mergeFragmentIntoListItems(currentListEntry.items, fragment);
  await persistFragmentListEntry(createFragmentListCacheEntry(nextItems));
}

export async function removeFragmentCache(fragmentId: string): Promise<void> {
  /** 中文注释：删除 fragment 后同步清理详情缓存、列表缓存和内存镜像。 */
  detailMemoryCache.delete(fragmentId);
  await AsyncStorage.removeItem(buildDetailKey(fragmentId));

  const currentListEntry = await readFragmentListCache();
  const nextItems = removeFragmentFromListItems(currentListEntry?.items ?? [], fragmentId);
  await persistFragmentListEntry(nextItems.length ? createFragmentListCacheEntry(nextItems) : null);
}
