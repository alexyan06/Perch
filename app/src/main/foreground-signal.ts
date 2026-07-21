export interface ForegroundSignal {
  appName: string | null;
  windowTitle: string | null;
  processId: number | null;
}

// Perch and the desktop are interaction surfaces, not work contexts. They
// deliberately preserve the last real app or browser-tab classification.
export function isTransparentForegroundSignal(
  signal: ForegroundSignal,
  perchProcessIds: ReadonlySet<number>,
): boolean {
  if (signal.windowTitle === null || signal.windowTitle.trim().length === 0) {
    return true;
  }
  if (signal.processId !== null && perchProcessIds.has(signal.processId)) {
    return true;
  }

  // Process IDs are the reliable production path. These fallbacks make the
  // behavior resilient to platform-specific active-window metadata and dev.
  return (
    signal.appName?.trim().toLowerCase() === "perch" ||
    signal.windowTitle.trim().toLowerCase() === "perch"
  );
}
