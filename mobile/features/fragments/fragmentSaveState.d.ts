export interface FragmentSaveOutcome {
  syncStatus: 'synced' | 'unsynced';
  shouldClearDraft: boolean;
  lastSyncedMarkdown: string;
}

export interface FragmentDoneAction {
  ok: boolean;
  shouldNavigate: boolean;
  message: string | null;
}

export declare function resolveSaveOutcome(input: {
  ok: boolean;
  savedMarkdown: string;
  attemptedMarkdown: string;
}): FragmentSaveOutcome;

export declare function resolveDoneAction(error: unknown): FragmentDoneAction;
