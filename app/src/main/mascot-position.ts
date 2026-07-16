import { app, screen, type Display } from "electron";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const MASCOT_WINDOW_WIDTH = 220;
export const MASCOT_WINDOW_HEIGHT = 164;
export const MASCOT_WINDOW_EXPANDED_HEIGHT = 260;
export const MASCOT_MARGIN = 24;

export interface SavedMascotPosition {
  x: number;
  y: number;
}

interface WorkAreaLike {
  workArea: { x: number; y: number; width: number; height: number };
}

// The mascot always starts bottom-right of the primary display — there's no
// corner picker anymore, just this fixed default plus wherever the user has
// since dragged it to (see SavedMascotPosition below).
function defaultPosition(workArea: WorkAreaLike["workArea"]): {
  x: number;
  y: number;
} {
  return {
    x: workArea.x + workArea.width - MASCOT_WINDOW_WIDTH - MASCOT_MARGIN,
    y: workArea.y + workArea.height - MASCOT_WINDOW_HEIGHT - MASCOT_MARGIN,
  };
}

function pointInWorkArea(
  x: number,
  y: number,
  workArea: WorkAreaLike["workArea"],
): boolean {
  return (
    x >= workArea.x &&
    x < workArea.x + workArea.width &&
    y >= workArea.y &&
    y < workArea.y + workArea.height
  );
}

// Pure — takes already-fetched display data rather than calling screen.*
// itself, so it's testable without a real Electron runtime (same pattern
// as nudge.ts/escalation.ts's dependency-injected trackers).
export function resolveMascotBounds(
  displays: WorkAreaLike[],
  primaryDisplay: WorkAreaLike,
  saved: SavedMascotPosition | null,
): { x: number; y: number } {
  if (saved === null) {
    return defaultPosition(primaryDisplay.workArea);
  }

  // Only trust a saved position if it still falls within one of the
  // currently-connected displays' work areas. Protects against exactly the
  // scenario an external-monitor setup can hit: drag the mascot onto a
  // second display, then later launch with only the laptop screen
  // connected — falls back to the default instead of opening off-screen
  // and unreachable.
  const stillVisible = displays.some((d) =>
    pointInWorkArea(saved.x, saved.y, d.workArea),
  );
  if (!stillVisible) {
    return defaultPosition(primaryDisplay.workArea);
  }
  return { x: saved.x, y: saved.y };
}

function positionFilePath(): string {
  return join(app.getPath("userData"), "mascot-position.json");
}

export function getSavedMascotPosition(): SavedMascotPosition | null {
  const path = positionFilePath();
  if (!existsSync(path)) return null;
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof data !== "object" || data === null) return null;
    const obj = data as Record<string, unknown>;
    if (typeof obj["x"] === "number" && typeof obj["y"] === "number") {
      return { x: obj["x"], y: obj["y"] };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveMascotPosition(position: SavedMascotPosition): void {
  writeFileSync(positionFilePath(), JSON.stringify(position));
}

// Real-Electron wrapper — the only thing in this module that touches
// screen.* directly, kept thin on purpose so resolveMascotBounds above
// stays fully unit-testable.
export function getMascotWindowBounds(): { x: number; y: number } {
  const displays: Display[] = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  return resolveMascotBounds(
    displays,
    primaryDisplay,
    getSavedMascotPosition(),
  );
}
