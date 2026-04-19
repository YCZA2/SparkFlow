/**
 * 编辑器会话持久化逻辑
 *
 * 包含乐观更新、文档发布等持久化相关的判断和操作逻辑。
 */

import { shouldCommitOptimisticDocument, shouldProtectSuspiciousEmptySnapshot } from './sessionHydration';
import type { EditorSessionState } from './sessionState';

/*仅当正文或素材展示态变化时才回写详情资源层。 */
export function shouldPublishOptimisticDocument(state: EditorSessionState): boolean {
  if (!state.source.document || !state.documentId || !state.isPendingBodyHydrated) return false;
  const baselineBodyHtml = state.baseline?.baseline_body_html ?? '';
  if (shouldProtectSuspiciousEmptySnapshot({
    snapshot: state.snapshot,
    baselineBodyHtml,
    hasPendingBody: state.source.pending_body_html !== null,
    hasConfirmedLocalEdit: state.hasConfirmedLocalEdit,
  })) {
    return false;
  }
  return shouldCommitOptimisticDocument(
    state.source.document,
    state.snapshot,
    state.mediaAssets
  );
}
