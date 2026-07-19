import { describe, expect, it, vi } from "vitest";
import { createNudgeTracker } from "./nudge";

function createTracker() {
  return createNudgeTracker("session", {
    startInterval: vi.fn(() => "interval"),
    endInterval: vi.fn(),
  });
}

describe("nudge tracker escalation reasons", () => {
  it("marks a sustained direct nudge as elapsed", () => {
    const tracker = createTracker();
    tracker.onTick("distraction", 0);
    expect(tracker.onTick("distraction", 60_000)).toEqual({
      type: "trigger",
      stage: 3,
      distractedSinceSeconds: 60,
      escalationReason: "elapsed",
    });
  });

  it("marks repeated quick relapses as rapid without a fake duration", () => {
    const tracker = createTracker();
    tracker.onTick("distraction", 0);
    tracker.onTick("on_task", 1_000);
    tracker.onTick("distraction", 2_000);
    tracker.onTick("on_task", 3_000);
    expect(tracker.onTick("distraction", 4_000)).toEqual({
      type: "trigger",
      stage: 3,
      distractedSinceSeconds: 0,
      escalationReason: "rapid_relapse",
    });
  });
});
