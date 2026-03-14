/**
 * 编辑器会话工具函数
 *
 * 包含媒体素材处理、文本长度计算、同步状态判断等通用工具函数。
 */

import { extractPlainTextFromHtml } from '@/features/editor/html';
import type { EditorMediaAsset, EditorSaveState, EditorSourceDocument } from '@/features/editor/types';

/*统一抽取素材 id，用于比较当前展示态是否已同步。 */
export function collectMediaAssetIds(mediaAssets: EditorMediaAsset[] | null | undefined): string[] {
  return (mediaAssets ?? []).map((asset) => asset.id);
}

/*素材列表按顺序比较，避免图片顺序变化被静默吞掉。 */
export function areAssetIdsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/*统一按纯文本长度评估正文完整度，避免 HTML 标签干扰比较。 */
export function resolveMeaningfulTextLength(html: string | null | undefined): number {
  return extractPlainTextFromHtml(html).length;
}

/*只把真正有正文文本的内容视为可用正文，空白和纯格式不算。 */
export function hasMeaningfulBody(html: string | null | undefined): boolean {
  return resolveMeaningfulTextLength(html) > 0;
}

/*把本地草稿同步态映射为统一的编辑器保存状态。 */
export function resolveLocalDraftSyncStatus(document: EditorSourceDocument | null): EditorSaveState {
  if (!document?.is_local_draft) return 'idle';
  if (document.sync_status === 'synced') return 'synced';
  if (document.sync_status === 'pending') return 'syncing';
  return 'idle';
}