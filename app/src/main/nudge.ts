import { startDistractionInterval, endDistractionInterval } from "./db";

export type NudgeStage = 0 | 1 | 2 | 3;

const STAGE_1_THRESHOLD_MS = 0;
const STAGE_2_THRESHOLD_MS = 20_000;
const STAGE_3_THRESHOLD_MS = 60_000;
const RELAPSE_WINDOW_MS = 45_000;
const REPEATED_RELAPSE_COUNT = 2;

export type NudgeEvent =
  | { type: "trigger"; stage: 1 | 2 | 3; distractedSinceSeconds: number }
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
    classification: "on_task" | "distraction" | "drift" | "ambiguous",
    now: number,
  ): NudgeEvent;
} {
  const start = deps?.startInterval ?? startDistractionInterval;
  const end = deps?.endInterval ?? endDistractionInterval;

  let intervalId: string | null = null;
  let distractionStartedAt = 0;
  let currentStage: NudgeStage = 0;
  let maxStageReached: NudgeStage = 0;
  let relapseCount = 0;
  let lastClosedAt: number | null = null;
  let lastClosedMaxStage: NudgeStage = 0;

  function onTick(
    classification: "on_task" | "distraction" | "drift" | "ambiguous",
    now: number,
  ): NudgeEvent {
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

      const isRelapse =
        lastClosedAt !== null &&
        lastClosedMaxStage >= 1 &&
        now - lastClosedAt <= RELAPSE_WINDOW_MS;
      if (isRelapse) relapseCount++;
    }

    const elapsedMs = now - distractionStartedAt;
    let targetStage = durationStage(elapsedMs);
    if (relapseCount >= REPEATED_RELAPSE_COUNT) {
      targetStage = Math.max(targetStage, 3) as NudgeStage;
    } else if (relapseCount >= 1) {
      targetStage = Math.max(targetStage, 2) as NudgeStage;
    }

    maxStageReached = Math.max(maxStageReached, targetStage) as NudgeStage;

    if (targetStage > currentStage) {
      currentStage = targetStage;
      return {
        type: "trigger",
        stage: currentStage as 1 | 2 | 3,
        distractedSinceSeconds: Math.floor(elapsedMs / 1000),
      };
    }

    return { type: "none" };
  }

  return { onTick };
}
