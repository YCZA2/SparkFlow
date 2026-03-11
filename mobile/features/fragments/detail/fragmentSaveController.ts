interface CreateLatestOnlySaveControllerOptions<T> {
  submit: (value: T) => Promise<void>;
  shouldProcess: (value: T) => boolean;
}

export function createLatestOnlySaveController<T>({
  submit,
  shouldProcess,
}: CreateLatestOnlySaveControllerOptions<T>) {
  /*把连续输入压缩成“只保存最后一版”的串行保存队列。 */
  let inFlight: Promise<void> | null = null;
  let queuedValue: T | null = null;

  async function submitLatest(value: T): Promise<void> {
    if (!shouldProcess(value)) return;

    if (inFlight) {
      queuedValue = value;
      return await inFlight;
    }

    queuedValue = null;
    const currentValue = value;
    const savePromise = (async () => {
      let failed = false;
      try {
        if (shouldProcess(currentValue)) {
          await submit(currentValue);
        }
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        inFlight = null;
        if (!failed) {
          const nextValue = queuedValue;
          queuedValue = null;
          if (nextValue && shouldProcess(nextValue)) {
            await submitLatest(nextValue);
          }
        }
      }
    })();

    inFlight = savePromise;
    await savePromise;
  }

  return {
    submitLatest,
    peekQueued: () => queuedValue,
    isRunning: () => Boolean(inFlight),
  };
}
