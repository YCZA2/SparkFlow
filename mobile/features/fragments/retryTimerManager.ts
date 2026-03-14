/**
 * Fragment 同步重试定时器管理
 * 独立模块，避免循环依赖
 */

const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 调度 fragment 的重试定时器
 */
export function scheduleRetryTimer(
  fragmentId: string,
  delayMs: number,
  callback: () => void
): void {
  // 清理现有定时器
  clearRetryTimer(fragmentId);

  // 设置新定时器
  retryTimers.set(
    fragmentId,
    setTimeout(() => {
      retryTimers.delete(fragmentId);
      callback();
    }, delayMs)
  );
}

/**
 * 清理 fragment 的重试定时器
 */
export function clearRetryTimer(fragmentId: string): void {
  const timer = retryTimers.get(fragmentId);
  if (timer) {
    clearTimeout(timer);
    retryTimers.delete(fragmentId);
  }
}