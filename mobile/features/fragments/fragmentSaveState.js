export function resolveSaveOutcome({ ok, savedMarkdown, attemptedMarkdown }) {
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

export function resolveDoneAction(error) {
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
