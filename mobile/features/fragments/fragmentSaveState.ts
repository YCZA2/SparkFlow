export type FragmentSyncStatus = 'idle' | 'syncing' | 'synced' | 'unsynced';

interface ResolveSaveOutcomeInput {
  ok: boolean;
  savedMarkdown: string;
  attemptedMarkdown: string;
}

interface ResolveSaveOutcomeResult {
  syncStatus: FragmentSyncStatus;
  shouldClearDraft: boolean;
  lastSyncedMarkdown: string;
}

interface ResolveDoneActionResult {
  ok: boolean;
  shouldNavigate: boolean;
  message: string | null;
}

export function resolveSaveOutcome({
  ok,
  savedMarkdown,
  attemptedMarkdown,
}: ResolveSaveOutcomeInput): ResolveSaveOutcomeResult {
  /** 中文注释：把保存结果统一映射成编辑器同步态，减少页面层条件分支。 */
  if (ok) {
    return {
      syncStatus: 'synced',
      shouldClearDraft: true,
      lastSyncedMarkdown: savedMarkdown,
    };
  }

  return {
    syncStatus: 'unsynced',
    shouldClearDraft: false,
    lastSyncedMarkdown: attemptedMarkdown,
  };
}

export function resolveDoneAction(error: unknown): ResolveDoneActionResult {
  /** 中文注释：收敛“完成编辑”动作的导航与提示语义，保证失败时停留本地草稿。 */
  if (!error) {
    return {
      ok: true,
      shouldNavigate: true,
      message: null,
    };
  }

  return {
    ok: false,
    shouldNavigate: false,
    message: '内容未同步，已保留本地草稿',
  };
}
