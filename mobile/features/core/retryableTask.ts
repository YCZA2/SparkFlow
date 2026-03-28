export interface RetryableTaskController {
  run: () => Promise<void>;
  reset: () => void;
}

export function createRetryableTask(task: () => Promise<void>): RetryableTaskController {
  let currentPromise: Promise<void> | null = null;

  return {
    reset() {
      /*显式清空缓存 promise，让工作区切换后重新执行预热逻辑。 */
      currentPromise = null;
    },
    async run() {
      /*初始化失败时自动丢弃缓存 promise，保证同一会话内还能再次重试。 */
      if (!currentPromise) {
        currentPromise = task().catch((error) => {
          currentPromise = null;
          throw error;
        });
      }
      await currentPromise;
    },
  };
}
