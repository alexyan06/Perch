import { getSessionForSummary, getClassificationEvents } from "./db";
import {
  computeClassificationBreakdown,
  computeCategoryBreakdown,
  type CategoryDuration,
} from "./session-metrics";

export function generateEndOfSessionSummary(
  sessionId: string,
  endedAt: string,
): {
  task: string;
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
  categoryBreakdown: CategoryDuration[];
} {
  const session = getSessionForSummary(sessionId);
  if (!session) {
    throw new Error(`[summary] no session found for id ${sessionId}`);
  }

  const events = getClassificationEvents(sessionId);
  const { onTaskSeconds, distractedSeconds, ambiguousSeconds } =
    computeClassificationBreakdown(events, session.startedAt, endedAt);
  const categoryBreakdown = computeCategoryBreakdown(
    events,
    session.startedAt,
    endedAt,
  );

  return {
    task: session.task,
    onTaskSeconds,
    distractedSeconds,
    ambiguousSeconds,
    categoryBreakdown,
  };
}
