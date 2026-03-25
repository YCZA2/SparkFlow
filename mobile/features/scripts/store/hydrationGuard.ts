export interface LocalScriptHydrationGuardInput {
  hasLocalRow: boolean;
  backupStatus: string | null | undefined;
  hasBodyFile: boolean;
}

/*统一约束远端 script 何时允许灌回本地，避免旧投影覆盖本地真值。 */
export function shouldSkipRemoteScriptHydration(input: LocalScriptHydrationGuardInput): boolean {
  if (input.hasLocalRow) {
    return true;
  }
  if (input.backupStatus === 'pending' || input.backupStatus === 'failed') {
    return true;
  }
  return input.hasBodyFile;
}
