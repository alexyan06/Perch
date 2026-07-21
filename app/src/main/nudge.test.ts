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

  it("bumps one quick relapse to stage 2 without escalating later relapses to stage 3", () => {
    const tracker = createTracker();
    tracker.onTick("distraction", 0);
    tracker.onTick("on_task", 1_000);
    tracker.onTick("distraction", 2_000);
    tracker.onTick("on_task", 3_000);
    expect(tracker.onTick("distraction", 4_000)).toEqual({
      type: "trigger",
      stage: 2,
      distractedSinceSeconds: 0,
      escalationReason: "rapid_relapse",
    });
  });

  it("freezes an active nudge while observation is paused", () => {
    const tracker = createTracker();
    tracker.onTick("distraction", 0);
    tracker.onTick("paused", 10_000);
    tracker.onTick("paused", 70_000);

    expect(tracker.onTick("distraction", 80_000)).toEqual({ type: "none" });
    expect(tracker.onTick("distraction", 90_000)).toEqual({
      type: "trigger",
      stage: 2,
      distractedSinceSeconds: 20,
      escalationReason: "elapsed",
    });
  });

  it("does not start a nudge while observation is paused", () => {
    const tracker = createTracker();
    expect(tracker.onTick("paused", 0)).toEqual({ type: "none" });
  });

  it("does not start or advance a nudge while activity is ambiguous", () => {
    const tracker = createTracker();
    expect(tracker.onTick("ambiguous", 0)).toEqual({ type: "none" });
    tracker.onTick("distraction", 10_000);
    tracker.onTick("ambiguous", 20_000);
    expect(tracker.onTick("ambiguous", 80_000)).toEqual({ type: "none" });
    expect(tracker.onTick("distraction", 110_000)).toEqual({ type: "none" });
    expect(tracker.onTick("distraction", 130_000)).toEqual({
      type: "trigger",
      stage: 2,
      distractedSinceSeconds: 30,
      escalationReason: "elapsed",
    });
  });
});
