import { startDistractionInterval, endDistractionInterval } from "./db";

export type NudgeStage = 0 | 1 | 2 | 3;

const STAGE_1_THRESHOLD_MS = 0;
const STAGE_2_THRESHOLD_MS = 20_000;
const STAGE_3_THRESHOLD_MS = 60_000;
const RELAPSE_WINDOW_MS = 45_000;

export type NudgeEvent =
  | {
      type: "trigger";
      stage: 1 | 2 | 3;
      distractedSinceSeconds: number;
      escalationReason: "elapsed" | "rapid_relapse";
    }
  | { type: "clear" }
  | { type: "none" };

export interface NudgeTrackerDeps {
  startInterval?: typeof startDistractionInterval;
  endInterval?: typeof endDistractionInterval;
}

function durationStage(elapsedMs: number): NudgeStage {
  if (elapsedMs >= STAGE_3_THRESHOLD_MS) return 3;
  if (elapsedMs >= STAGE_2_THRESHOLD_MS) return 2;
  if (elapsedMs >= STAGE_1_THRESHOLD_MS) return 1;
  return 0;
}

export function createNudgeTracker(
  sessionId: string,
  deps?: NudgeTrackerDeps,
): {
  onTick(
    classification: "on_task" | "distraction" | "drift" | "ambiguous" | "paused",
    now: number,
  ): NudgeEvent;
} {
  const start = deps?.startInterval ?? startDistractionInterval;
  const end = deps?.endInterval ?? endDistractionInterval;

  let intervalId: string | null = null;
  let distractionStartedAt = 0;
  let currentStage: NudgeStage = 0;
  let maxStageReached: NudgeStage = 0;
  let lastClosedAt: number | null = null;
  let lastClosedMaxStage: NudgeStage = 0;
  let pausedAt: number | null = null;

  function onTick(
    classification: "on_task" | "distraction" | "drift" | "ambiguous" | "paused",
    now: number,
  ): NudgeEvent {
    if (classification === "paused" || classification === "ambiguous") {
      if (intervalId !== null && pausedAt === null) pausedAt = now;
      return { type: "none" };
    }

    if (pausedAt !== null) {
      // Desktop/no-window time is outside the focus assessment, so it does
      // not advance an existing nudge stage when observation resumes.
      distractionStartedAt += now - pausedAt;
      pausedAt = null;
    }

    if (classification === "on_task") {
      if (intervalId === null) return { type: "none" };
      end(intervalId, maxStageReached);
      lastClosedAt = now;
      lastClosedMaxStage = maxStageReached;
      intervalId = null;
      currentStage = 0;
      maxStageReached = 0;
      return { type: "clear" };
    }

    if (intervalId === null) {
      intervalId = start(sessionId);
      distractionStartedAt = now;
      currentStage = 0;
      maxStageReached = 0;

    }

    const elapsedMs = now - distractionStartedAt;
    const elapsedStage = durationStage(elapsedMs);
    const isRapidRelapse =
      lastClosedAt !== null &&
      lastClosedMaxStage >= 1 &&
      now - lastClosedAt <= RELAPSE_WINDOW_MS;
    const targetStage = isRapidRelapse
      ? (Math.max(elapsedStage, 2) as NudgeStage)
      : elapsedStage;

    maxStageReached = Math.max(maxStageReached, targetStage) as NudgeStage;

    if (targetStage > currentStage) {
      currentStage = targetStage;
      return {
        type: "trigger",
        stage: currentStage as 1 | 2 | 3,
        distractedSinceSeconds: Math.floor(elapsedMs / 1000),
        escalationReason:
          targetStage > elapsedStage ? "rapid_relapse" : "elapsed",
      };
    }

    return { type: "none" };
  }

  return { onTick };
}
