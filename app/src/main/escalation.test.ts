import { describe, expect, it, vi } from "vitest";
import { createEscalationTracker } from "./escalation";

describe("escalation tracker", () => {
  it("freezes ambiguity and never captures a screenshot during a transparent interaction", async () => {
    vi.useFakeTimers();
    const captureScreenshot = vi.fn();
    const tracker = createEscalationTracker({
      captureScreenshot,
      classifyScreenshot: vi.fn(),
      getPermissionStatus: vi.fn(() => ({
        screenRecording: true,
        accessibility: true,
      })),
      dwellThresholdMs: 60_000,
    });
    const base = {
      sessionId: "session",
      signalType: "native" as const,
      signalKey: "unknown",
      windowTitle: null,
      task: "write",
      distractionList: [],
    };

    vi.setSystemTime(0);
    await tracker.resolve({ ...base, tier1Result: "ambiguous" });
    vi.setSystemTime(10_000);
    tracker.pause(Date.now());
    vi.setSystemTime(70_000);
    await tracker.resolve({ ...base, tier1Result: "ambiguous" });

    expect(captureScreenshot).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
