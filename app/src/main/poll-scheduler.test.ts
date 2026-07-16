import { describe, expect, it, vi } from "vitest";
import { createDebouncedTrigger, createSerializedScheduler } from "./poll-scheduler";

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("createSerializedScheduler", () => {
  it("coalesces requests while classification is running", async () => {
    const first = deferred();
    const second = deferred();
    const run = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const scheduler = createSerializedScheduler(run, vi.fn());

    scheduler.request();
    scheduler.request();
    scheduler.request();
    expect(run).toHaveBeenCalledTimes(1);

    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);

    second.resolve();
  });

  it("recovers from a failed classification", async () => {
    const onError = vi.fn();
    const run = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("active window unavailable"))
      .mockResolvedValueOnce(undefined);
    const scheduler = createSerializedScheduler(run, onError);

    scheduler.request();
    await Promise.resolve();
    await Promise.resolve();
    scheduler.request();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("createDebouncedTrigger", () => {
  it("fires once after a burst", () => {
    vi.useFakeTimers();
    const trigger = vi.fn();
    const debounced = createDebouncedTrigger(trigger, 250);

    debounced.request();
    vi.advanceTimersByTime(100);
    debounced.request();
    vi.advanceTimersByTime(249);
    expect(trigger).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(trigger).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
