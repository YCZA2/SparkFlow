import {
  applyAiPatchToHtml,
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  normalizeBodyHtml,
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
  draftHtml: string | null;
  cachedBodyHtml: string | null;
}

interface ShouldRehydrateBodySessionOptions {
  fragment: Fragment;
  draftHtml: string | null;
  currentSnapshot: FragmentEditorSnapshot;
  remoteBaseline: string;
  visibleMediaAssets: MediaAsset[];
  hasConfirmedLocalEdit: boolean;
}

interface ShouldProtectSuspiciousEmptySnapshotOptions {
  snapshot: FragmentEditorSnapshot;
  remoteBaseline: string;
  hasLocalDraft: boolean;
  hasConfirmedLocalEdit: boolean;
}

function collectAssetIds(mediaAssets: MediaAsset[]): string[] {
  /*统一抽取素材 id，用于比较当前展示态是否已同步。 */
  return mediaAssets.map((asset) => asset.id);
}

function areAssetIdsEqual(left: string[], right: string[]): boolean {
  /*素材列表按顺序比较，避免图片顺序变化被静默吞掉。 */
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function buildFragmentEditorSnapshot(html: string): FragmentEditorSnapshot {
  /*把正文 HTML 统一规整成编辑器快照。 */
  const normalized = normalizeBodyHtml(html);
  return {
    body_html: normalized,
    plain_text: extractPlainTextFromHtml(normalized),
    asset_ids: extractAssetIdsFromHtml(normalized),
  };
}

function resolveMeaningfulTextLength(html: string | null | undefined): number {
  /*统一按纯文本长度评估正文完整度，避免 HTML 标签干扰比较。 */
  return extractPlainTextFromHtml(html).length;
}

function hasMeaningfulBody(html: string | null | undefined): boolean {
  /*只把真正有正文文本的内容视为可用正文，空白和纯格式不算。 */
  return resolveMeaningfulTextLength(html) > 0;
}

export function resolveHydratedBodySession({
  fragment,
  draftHtml,
  cachedBodyHtml,
}: ResolveHydratedBodySessionOptions): {
  snapshot: FragmentEditorSnapshot;
  remoteBaseline: string;
  syncStatus: FragmentSyncStatus;
} {
  /*统一计算详情编辑器的初始正文、远端基线和同步态。 */
  const nextHtml = normalizeBodyHtml(draftHtml ?? fragment.body_html);
  const snapshot = buildFragmentEditorSnapshot(nextHtml);
  const remoteBaseline =
    normalizeBodyHtml(cachedBodyHtml) ||
    (draftHtml == null ? normalizeBodyHtml(fragment.body_html) : '');
  return {
    snapshot,
    remoteBaseline,
    syncStatus: snapshot.body_html === remoteBaseline ? 'synced' : 'idle',
  };
}

export function shouldRehydrateBodySession({
  fragment,
  draftHtml,
  currentSnapshot,
  remoteBaseline,
  visibleMediaAssets,
  hasConfirmedLocalEdit,
}: ShouldRehydrateBodySessionOptions): boolean {
  /*仅在没有本地编辑负担时，才允许远端详情重建当前编辑会话。 */
  if (draftHtml !== null) return false;
  if (hasConfirmedLocalEdit) return false;
  if (normalizeBodyHtml(currentSnapshot.body_html) !== normalizeBodyHtml(remoteBaseline)) {
    return false;
  }

  const incomingSnapshot = buildFragmentEditorSnapshot(fragment.body_html);
  const incomingAssetIds = collectAssetIds(fragment.media_assets ?? []);
  const currentAssetIds = collectAssetIds(visibleMediaAssets);
  const bodyChanged = incomingSnapshot.body_html !== currentSnapshot.body_html;
  const mediaChanged = !areAssetIdsEqual(incomingAssetIds, currentAssetIds);

  if (!bodyChanged && !mediaChanged) return false;
  if (incomingSnapshot.plain_text.length > currentSnapshot.plain_text.length) return true;
  if (mediaChanged && incomingAssetIds.length > currentAssetIds.length) return true;
  return bodyChanged;
}

export function mergeVisibleMediaAssets(
  fragmentMediaAssets: MediaAsset[] | null | undefined,
  runtimeMediaAssets: MediaAsset[]
): MediaAsset[] {
  /*详情页可见素材以服务端顺序为主，再补齐运行态新增素材。 */
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
  /*把当前编辑结果合成为页面展示态 fragment。 */
  return {
    ...fragment,
    body_html: snapshot.body_html,
    plain_text_snapshot: snapshot.plain_text,
    media_assets: mediaAssets,
  };
}

export function shouldCommitOptimisticFragment(
  fragment: Fragment,
  snapshot: FragmentEditorSnapshot,
  visibleMediaAssets: MediaAsset[]
): boolean {
  /*只有正文或素材列表真正变化时才更新可见 fragment。 */
  const currentHtml = normalizeBodyHtml(fragment.body_html);
  const currentAssetIds = collectAssetIds(fragment.media_assets ?? []);
  const nextAssetIds = collectAssetIds(visibleMediaAssets);
  return (
    currentHtml !== snapshot.body_html ||
    !areAssetIdsEqual(currentAssetIds, nextAssetIds)
  );
}

export function shouldProtectSuspiciousEmptySnapshot({
  snapshot,
  remoteBaseline,
  hasLocalDraft,
  hasConfirmedLocalEdit,
}: ShouldProtectSuspiciousEmptySnapshotOptions): boolean {
  /*若空正文仅像初始化异常而非用户操作，则阻止其污染本地和远端状态。 */
  if (hasLocalDraft) return false;
  if (hasConfirmedLocalEdit) return false;
  return !hasMeaningfulBody(snapshot.body_html) && hasMeaningfulBody(remoteBaseline);
}

export function appendRuntimeMediaAsset(
  currentAssets: MediaAsset[],
  nextAsset: MediaAsset
): MediaAsset[] {
  /*新增素材只保留一份，并维持用户插图顺序。 */
  if (currentAssets.some((item) => item.id === nextAsset.id)) return currentAssets;
  return [...currentAssets, nextAsset];
}

export function applyAiPatchFallbackToSnapshot(
  snapshot: FragmentEditorSnapshot,
  patch: FragmentAiPatch,
  selectionText: string
): FragmentEditorSnapshot {
  /*当原生 bridge 不可用时，回退到 HTML 字符串 patch。 */
  return buildFragmentEditorSnapshot(
    applyAiPatchToHtml(snapshot.body_html, patch, selectionText)
  );
}
