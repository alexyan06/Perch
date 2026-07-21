import type { Tier1Result } from "./classifier";
import { captureActiveWindowScreenshot } from "./screenshot";
import { classifyScreenshot, type VisionClassifyResult } from "./vision-client";
import { getPermissionStatus } from "./permissions";

const DWELL_THRESHOLD_MS = 60_000;

export interface EscalationResult {
  classification: "on_task" | "distraction" | "drift" | "ambiguous";
  signalType: "native" | "browser" | "vision";
  reasoning?: string;
}

export interface EscalationTrackerDeps {
  captureScreenshot?: typeof captureActiveWindowScreenshot;
  classifyScreenshot?: typeof classifyScreenshot;
  getPermissionStatus?: typeof getPermissionStatus;
  dwellThresholdMs?: number;
}

interface DwellState {
  signalKey: string;
  ambiguousSince: number;
  resolved?: VisionClassifyResult;
}

export function createEscalationTracker(deps?: EscalationTrackerDeps): {
  resolve(params: {
    sessionId: string;
    tier1Result: Tier1Result;
    signalType: "native" | "browser";
    signalKey: string;
    windowTitle: string | null;
    task: string;
    distractionList: string[];
  }): Promise<EscalationResult>;
  pause(now: number): void;
} {
  const capture = deps?.captureScreenshot ?? captureActiveWindowScreenshot;
  const classify = deps?.classifyScreenshot ?? classifyScreenshot;
  const getStatus = deps?.getPermissionStatus ?? getPermissionStatus;
  const dwellThresholdMs = deps?.dwellThresholdMs ?? DWELL_THRESHOLD_MS;

  let dwell: DwellState | null = null;
  let pausedAt: number | null = null;

  function resumeDwell(now: number): void {
    if (dwell !== null && pausedAt !== null) {
      dwell.ambiguousSince += now - pausedAt;
    }
    pausedAt = null;
  }

  async function resolve(params: {
    sessionId: string;
    tier1Result: Tier1Result;
    signalType: "native" | "browser";
    signalKey: string;
    windowTitle: string | null;
    task: string;
    distractionList: string[];
  }): Promise<EscalationResult> {
    resumeDwell(Date.now());
    if (params.tier1Result !== "ambiguous") {
      dwell = null;
      return {
        classification: params.tier1Result,
        signalType: params.signalType,
      };
    }

    if (dwell === null || dwell.signalKey !== params.signalKey) {
      dwell = { signalKey: params.signalKey, ambiguousSince: Date.now() };
      return { classification: "ambiguous", signalType: params.signalType };
    }

    if (dwell.resolved) {
      return {
        classification: dwell.resolved.classification,
        signalType: "vision",
        reasoning: dwell.resolved.reasoning,
      };
    }

    const dwellMs = Date.now() - dwell.ambiguousSince;
    if (dwellMs < dwellThresholdMs) {
      return { classification: "ambiguous", signalType: params.signalType };
    }

    try {
      const screenshotBase64 = await capture(params.windowTitle);
      if (screenshotBase64 === null) {
        // Screen Recording being denied is one real cause, but not the only
        // one — a briefly stale window title (e.g. right after the browser
        // extension reconnects) also produces "no matching source" even
        // with permission granted. Check which one it actually is instead
        // of always blaming permissions.
        if (getStatus().screenRecording) {
          console.warn(
            "[escalation] screenshot capture found no matching window source (permission is granted) — the signal may be stale or the window title didn't match",
          );
        } else {
          console.warn(
            "[escalation] no matching window source for screenshot — check macOS Screen Recording permission",
          );
        }
        return { classification: "ambiguous", signalType: params.signalType };
      }

      const result = await classify({
        sessionId: params.sessionId,
        task: params.task,
        distractionList: params.distractionList,
        screenshotBase64,
      });

      dwell.resolved = result;
      return {
        classification: result.classification,
        signalType: "vision",
        reasoning: result.reasoning,
      };
    } catch (err) {
      console.error(
        "[escalation] vision call failed, falling back to ambiguous:",
        err,
      );
      return { classification: "ambiguous", signalType: params.signalType };
    }
  }

  return {
    resolve,
    pause(now: number): void {
      if (dwell !== null && pausedAt === null) pausedAt = now;
    },
  };
}
