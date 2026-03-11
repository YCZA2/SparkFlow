import {
  applyAiPatchToMarkdown,
  extractAssetIdsFromMarkdown,
  extractPlainTextFromMarkdown,
  normalizeBodyMarkdown,
} from '@/features/fragments/bodyMarkdown';
import type {
  Fragment,
  FragmentAiPatch,
  FragmentEditorSnapshot,
  MediaAsset,
} from '@/types/fragment';

import type { FragmentSyncStatus } from '@/features/fragments/fragmentSaveState';

interface ResolveHydratedBodySessionOptions {
  fragment: Fragment;
  draftMarkdown: string | null;
  cachedBodyMarkdown: string | null;
}

function collectAssetIds(mediaAssets: MediaAsset[]): string[] {
  /** 中文注释：统一抽取素材 id，用于比较当前展示态是否已同步。 */
  return mediaAssets.map((asset) => asset.id);
}

function areAssetIdsEqual(left: string[], right: string[]): boolean {
  /** 中文注释：素材列表按顺序比较，避免图片顺序变化被静默吞掉。 */
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function buildFragmentEditorSnapshot(markdown: string): FragmentEditorSnapshot {
  /** 中文注释：把正文 Markdown 统一规整成编辑器快照。 */
  const normalized = normalizeBodyMarkdown(markdown);
  return {
    body_markdown: normalized,
    plain_text: extractPlainTextFromMarkdown(normalized),
    asset_ids: extractAssetIdsFromMarkdown(normalized),
  };
}

export function resolveHydratedBodySession({
  fragment,
  draftMarkdown,
  cachedBodyMarkdown,
}: ResolveHydratedBodySessionOptions): {
  snapshot: FragmentEditorSnapshot;
  remoteBaseline: string;
  syncStatus: FragmentSyncStatus;
} {
  /** 中文注释：统一计算详情编辑器的初始正文、远端基线和同步态。 */
  const nextMarkdown = normalizeBodyMarkdown(draftMarkdown ?? fragment.body_markdown);
  const snapshot = buildFragmentEditorSnapshot(nextMarkdown);
  const remoteBaseline =
    normalizeBodyMarkdown(cachedBodyMarkdown) ||
    (draftMarkdown == null ? normalizeBodyMarkdown(fragment.body_markdown) : '');
  return {
    snapshot,
    remoteBaseline,
    syncStatus: snapshot.body_markdown === remoteBaseline ? 'synced' : 'idle',
  };
}

export function mergeVisibleMediaAssets(
  fragmentMediaAssets: MediaAsset[] | null | undefined,
  runtimeMediaAssets: MediaAsset[]
): MediaAsset[] {
  /** 中文注释：详情页可见素材以服务端顺序为主，再补齐运行态新增素材。 */
  const merged = [...(fragmentMediaAssets ?? [])];
  for (const asset of runtimeMediaAssets) {
    if (!merged.some((item) => item.id === asset.id)) merged.push(asset);
  }
  return merged;
}

export function buildOptimisticFragmentSnapshot(
  fragment: Fragment,
  snapshot: FragmentEditorSnapshot,
  mediaAssets: MediaAsset[]
): Fragment {
  /** 中文注释：把当前编辑结果合成为页面展示态 fragment。 */
  return {
    ...fragment,
    body_markdown: snapshot.body_markdown,
    plain_text_snapshot: snapshot.plain_text,
    media_assets: mediaAssets,
  };
}

export function shouldCommitOptimisticFragment(
  fragment: Fragment,
  snapshot: FragmentEditorSnapshot,
  visibleMediaAssets: MediaAsset[]
): boolean {
  /** 中文注释：只有正文或素材列表真正变化时才更新可见 fragment。 */
  const currentMarkdown = normalizeBodyMarkdown(fragment.body_markdown);
  const currentAssetIds = collectAssetIds(fragment.media_assets ?? []);
  const nextAssetIds = collectAssetIds(visibleMediaAssets);
  return (
    currentMarkdown !== snapshot.body_markdown ||
    !areAssetIdsEqual(currentAssetIds, nextAssetIds)
  );
}

export function appendRuntimeMediaAsset(
  currentAssets: MediaAsset[],
  nextAsset: MediaAsset
): MediaAsset[] {
  /** 中文注释：新增素材只保留一份，并维持用户插图顺序。 */
  if (currentAssets.some((item) => item.id === nextAsset.id)) return currentAssets;
  return [...currentAssets, nextAsset];
}

export function applyAiPatchFallbackToSnapshot(
  snapshot: FragmentEditorSnapshot,
  patch: FragmentAiPatch,
  selectionText: string
): FragmentEditorSnapshot {
  /** 中文注释：当 DOM bridge 不可用时，回退到 Markdown 字符串 patch。 */
  return buildFragmentEditorSnapshot(
    applyAiPatchToMarkdown(snapshot.body_markdown, patch, selectionText)
  );
}
