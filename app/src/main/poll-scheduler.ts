export interface SerializedScheduler {
  request(): void;
  dispose(): void;
}

// Ensures callers from timers and external events never run classification at
// the same time. A burst while work is in flight is represented by one
// follow-up run with the freshest available signal.
export function createSerializedScheduler(
  run: () => Promise<void>,
  onError: (error: unknown) => void,
): SerializedScheduler {
  let disposed = false;
  let running = false;
  let queued = false;

  const request = (): void => {
    if (disposed) return;
    if (running) {
      queued = true;
      return;
    }

    running = true;
    void run()
      .catch(onError)
      .finally(() => {
        running = false;
        if (queued && !disposed) {
          queued = false;
          request();
        }
      });
  };

  return {
    request,
    dispose: () => {
      disposed = true;
      queued = false;
    },
  };
}

export interface DebouncedTrigger {
  request(): void;
  dispose(): void;
}

export function createDebouncedTrigger(
  trigger: () => void,
  delayMs: number,
): DebouncedTrigger {
  let disposed = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return {
    request: () => {
      if (disposed) return;
      if (timeout !== null) clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = null;
        if (!disposed) trigger();
      }, delayMs);
    },
    dispose: () => {
      disposed = true;
      if (timeout !== null) clearTimeout(timeout);
      timeout = null;
    },
  };
}
