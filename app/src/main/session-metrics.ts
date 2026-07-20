import type { ClassificationEventForSummary, SessionStatsRow } from "./db";

// Pure functions only, no value-imports from db.ts/electron, so this module
// can be loaded without a real Electron runtime — useful for isolated testing.

type Bucket = "onTask" | "distracted" | "ambiguous";

function bucketFor(
  classification: "on_task" | "distraction" | "drift" | "ambiguous",
): Bucket {
  if (classification === "on_task") return "onTask";
  if (classification === "ambiguous") return "ambiguous";
  return "distracted"; // "distraction" | "drift"
}

// Each classification event is assumed to hold from its own timestamp until
// the next event's timestamp (the last event holds until the session ends).
// Time before the first event has no signal at all, so it's attributed to
// the first event's own classification rather than left uncounted.
function computeEventDurationsMs(
  events: ClassificationEventForSummary[],
  startedAt: string,
  endedAt: string,
): Array<{ event: ClassificationEventForSummary; durationMs: number }> {
  if (events.length === 0) return [];

  const timestamps = [
    new Date(startedAt).getTime(),
    ...events.map((e) => new Date(e.timestamp).getTime()),
    new Date(endedAt).getTime(),
  ];

  const durations: Array<{
    event: ClassificationEventForSummary;
    durationMs: number;
  }> = [];
  for (let i = 0; i < timestamps.length - 1; i++) {
    const eventIndex = Math.max(0, i - 1);
    durations.push({
      event: events[eventIndex],
      durationMs: Math.max(0, timestamps[i + 1] - timestamps[i]),
    });
  }
  return durations;
}

export interface ClassificationBreakdown {
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
}

export function computeClassificationBreakdown(
  events: ClassificationEventForSummary[],
  startedAt: string,
  endedAt: string,
): ClassificationBreakdown {
  const totals: Record<Bucket, number> = {
    onTask: 0,
    distracted: 0,
    ambiguous: 0,
  };

  for (const { event, durationMs } of computeEventDurationsMs(
    events,
    startedAt,
    endedAt,
  )) {
    totals[bucketFor(event.classification)] += durationMs;
  }

  return {
    onTaskSeconds: Math.round(totals.onTask / 1000),
    distractedSeconds: Math.round(totals.distracted / 1000),
    ambiguousSeconds: Math.round(totals.ambiguous / 1000),
  };
}

export function extractCategoryLabel(rawSignal: unknown): string {
  if (typeof rawSignal !== "object" || rawSignal === null) return "Unknown";
  const signal = rawSignal as { url?: unknown; appName?: unknown };

  if (typeof signal.url === "string" && signal.url.length > 0) {
    try {
      const hostname = new URL(signal.url).hostname;
      return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    } catch {
      // malformed URL — fall through to appName below
    }
  }

  if (typeof signal.appName === "string" && signal.appName.length > 0) {
    // Electron reports the host process name rather than Perch's app name.
    // Keep the underlying signal intact, but present Perch in the user's
    // session history where this is their own desktop companion.
    return signal.appName.toLowerCase() === "electron" ? "Perch" : signal.appName;
  }

  return "Unknown";
}

export interface CategoryDuration {
  label: string;
  seconds: number;
}

// Shared by both computeCategoryBreakdown (one session's raw events) and
// mergeCategoryBreakdowns (many sessions' already-computed breakdowns) —
// same "rank descending, fold the tail into Other" contract either way.
function sortAndFold(
  totalsByLabel: Map<string, number>,
  topN: number,
): CategoryDuration[] {
  const sorted = Array.from(totalsByLabel.entries())
    .map(([label, seconds]) => ({ label, seconds }))
    .sort((a, b) => b.seconds - a.seconds);

  if (sorted.length <= topN) return sorted;

  const top = sorted.slice(0, topN);
  const otherSeconds = sorted
    .slice(topN)
    .reduce((sum, entry) => sum + entry.seconds, 0);
  return [...top, { label: "Other", seconds: otherSeconds }];
}

export function computeCategoryBreakdown(
  events: ClassificationEventForSummary[],
  startedAt: string,
  endedAt: string,
  topN = 8,
): CategoryDuration[] {
  const totalsByLabelMs = new Map<string, number>();

  for (const { event, durationMs } of computeEventDurationsMs(
    events,
    startedAt,
    endedAt,
  )) {
    const label = extractCategoryLabel(event.rawSignal);
    totalsByLabelMs.set(label, (totalsByLabelMs.get(label) ?? 0) + durationMs);
  }

  const totalsByLabelSeconds = new Map(
    Array.from(totalsByLabelMs.entries()).map(([label, ms]) => [
      label,
      Math.round(ms / 1000),
    ]),
  );
  return sortAndFold(totalsByLabelSeconds, topN);
}

// Merges several sessions' already-computed category breakdowns into one —
// each session's own "Other" row (if it has one) just merges into the
// combined "Other" like any other label, which is the correct behavior:
// there's no way to un-fold what an individual session already collapsed.
export function mergeCategoryBreakdowns(
  breakdowns: CategoryDuration[][],
  topN = 8,
): CategoryDuration[] {
  const totalsByLabel = new Map<string, number>();
  for (const breakdown of breakdowns) {
    for (const { label, seconds } of breakdown) {
      totalsByLabel.set(label, (totalsByLabel.get(label) ?? 0) + seconds);
    }
  }
  return sortAndFold(totalsByLabel, topN);
}

export interface AggregatedSessionStats {
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
  categoryBreakdown: CategoryDuration[];
}

export function aggregateSessionStats(
  rows: SessionStatsRow[],
): AggregatedSessionStats {
  return {
    onTaskSeconds: rows.reduce((sum, r) => sum + r.onTaskSeconds, 0),
    distractedSeconds: rows.reduce((sum, r) => sum + r.distractedSeconds, 0),
    ambiguousSeconds: rows.reduce((sum, r) => sum + r.ambiguousSeconds, 0),
    categoryBreakdown: mergeCategoryBreakdowns(
      rows.map((r) => r.categoryBreakdown),
    ),
  };
}
