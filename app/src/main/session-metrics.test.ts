import { describe, expect, it } from "vitest";
import {
  computeCategoryBreakdown,
  computeClassificationBreakdown,
  extractCategoryLabel,
} from "./session-metrics";

describe("category labels", () => {
  it("presents Electron activity as Perch", () => {
    expect(extractCategoryLabel({ appName: "Electron" })).toBe("Perch");
    expect(extractCategoryLabel({ appName: "electron" })).toBe("Perch");
  });

  it("keeps other native app names unchanged", () => {
    expect(extractCategoryLabel({ appName: "Figma" })).toBe("Figma");
  });

  it("excludes paused activity from time and category totals", () => {
    const events = [
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        signalType: "native" as const,
        classification: "on_task" as const,
        reasoning: null,
        rawSignal: { appName: "Figma" },
      },
      {
        timestamp: "2026-01-01T00:00:10.000Z",
        signalType: "native" as const,
        classification: "paused" as const,
        reasoning: null,
        rawSignal: { appName: null },
      },
      {
        timestamp: "2026-01-01T00:00:30.000Z",
        signalType: "native" as const,
        classification: "distraction" as const,
        reasoning: null,
        rawSignal: { appName: "YouTube" },
      },
    ];

    expect(
      computeClassificationBreakdown(
        events,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:40.000Z",
      ),
    ).toEqual({ onTaskSeconds: 10, distractedSeconds: 10, ambiguousSeconds: 0 });
    expect(
      computeCategoryBreakdown(
        events,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:40.000Z",
      ),
    ).toEqual([
      { label: "Figma", seconds: 10 },
      { label: "YouTube", seconds: 10 },
    ]);
  });
});
