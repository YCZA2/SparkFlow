export interface NavigationAttemptRecord {
  key: string | null;
  triggeredAt: number;
}

export function shouldBlockNavigationAttempt(
  previous: NavigationAttemptRecord | null | undefined,
  nextKey: string,
  now = Date.now(),
  cooldownMs = 600
): boolean {
  /*仅拦截短时间内命中同一目标的重复导航，保留切换不同目标时的即时响应。 */
  if (!previous?.key) {
    return false;
  }

  return previous.key === nextKey && now - previous.triggeredAt < cooldownMs;
}

export function createNavigationAttemptRecord(
  key: string,
  now = Date.now()
): NavigationAttemptRecord {
  /*统一生成最新导航记录，供导航锁复用最近一次成功触发的信息。 */
  return {
    key,
    triggeredAt: now,
  };
}
