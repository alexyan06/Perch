import { describe, expect, it } from "vitest";
import { isTransparentForegroundSignal } from "./foreground-signal";

describe("transparent foreground signals", () => {
  it("ignores desktop activity with no window title", () => {
    expect(
      isTransparentForegroundSignal(
        { appName: null, windowTitle: null, processId: null },
        new Set(),
      ),
    ).toBe(true);
  });

  it("ignores Perch windows by their renderer process ID", () => {
    expect(
      isTransparentForegroundSignal(
        { appName: "Electron", windowTitle: "Session active", processId: 42 },
        new Set([42]),
      ),
    ).toBe(true);
  });

  it("keeps identifiable non-Perch apps eligible for classification", () => {
    expect(
      isTransparentForegroundSignal(
        { appName: "Google Chrome", windowTitle: "YouTube", processId: 7 },
        new Set([42]),
      ),
    ).toBe(false);
  });
});
