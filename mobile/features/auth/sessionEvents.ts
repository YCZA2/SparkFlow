const listeners = new Set<(reason?: string | null) => void>();

export function emitAuthSessionLost(reason?: string | null): void {
  /*当 token 失效或设备会话被顶掉时，通知 UI 立即切回登录态。 */
  for (const listener of listeners) {
    listener(reason);
  }
}

export function subscribeAuthSessionLost(listener: (reason?: string | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
