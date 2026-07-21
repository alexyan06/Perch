import activeWin from "active-win";
import { BrowserWindow, powerMonitor } from "electron";
import { insertClassificationEvent } from "./db";
import { classifyTier1 } from "./classifier";
import { isTransparentForegroundSignal } from "./foreground-signal";
import { getLatestBrowserSignal, onBrowserSignalChange } from "./ws-server";
import { createEscalationTracker } from "./escalation";
import { createNudgeTracker } from "./nudge";
import {
  createDebouncedTrigger,
  createSerializedScheduler,
} from "./poll-scheduler";
import {
  createMascotMessagePicker,
  type MascotMessagePack,
} from "../shared/mascot-messages";
import type {
  ClassificationTickPayload,
  NudgeClearPayload,
  NudgeTriggerPayload,
  SessionStartRequest,
} from "../shared/ipc";

const BROWSER_APP_NAMES = [
  "google chrome",
  "chrome",
  "chromium",
  "safari",
  "firefox",
  "arc",
  "brave",
  "microsoft edge",
  "opera",
];

const POLL_INTERVAL_MS = 7000;
const ACTIVE_WINDOW_CHECK_INTERVAL_MS = 500;
const BROWSER_SIGNAL_DEBOUNCE_MS = 250;

function sendNudgeClear(sessionId: string, message: string): void {
  const clearPayload: NudgeClearPayload = { sessionId, message };
  BrowserWindow.getAllWindows()[0]?.webContents.send(
    "nudge:clear",
    clearPayload,
  );
  console.log("[nudge] clear", clearPayload);
}

export function startPolling(
  sessionId: string,
  config: SessionStartRequest,
  messagePack: MascotMessagePack,
): () => void {
  const { task, distractionList, approvedList } = config;
  const escalationTracker = createEscalationTracker();
  const nudgeTracker = createNudgeTracker(sessionId);
  const messagePicker = createMascotMessagePicker(messagePack);
  let disposed = false;
  let lastObservedNativeSignal: string | null = null;
  let activeWindowRead: ReturnType<typeof activeWin> | null = null;

  const getActiveWindow = (): ReturnType<typeof activeWin> => {
    if (activeWindowRead !== null) return activeWindowRead;
    activeWindowRead = activeWin().finally(() => {
      activeWindowRead = null;
    });
    return activeWindowRead;
  };

  const tick = async (): Promise<void> => {
    const win = await getActiveWindow();
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const timestamp = new Date().toISOString();

    const appName = win?.owner.name ?? null;
    const windowTitle = win?.title ?? null;
    const processId = win?.owner.processId ?? null;

    const isBrowser =
      appName !== null && BROWSER_APP_NAMES.includes(appName.toLowerCase());

    const browserSignal = isBrowser ? getLatestBrowserSignal() : null;
    const effectiveWindowTitle = browserSignal?.tabTitle ?? windowTitle;

    const perchProcessIds = new Set(
      BrowserWindow.getAllWindows()
        .filter((window) => !window.isDestroyed())
        .map((window) => window.webContents.getOSProcessId()),
    );
    if (
      isTransparentForegroundSignal(
        { appName, windowTitle: effectiveWindowTitle, processId },
        perchProcessIds,
      )
    ) {
      const now = Date.now();
      escalationTracker.pause(now);
      nudgeTracker.onTick("paused", now);
      console.log("[poller] preserving prior activity during Perch/desktop interaction");
      return;
    }

    const tier1Result = classifyTier1(
      { appName, windowTitle: effectiveWindowTitle },
      { task, distractionList, approvedList },
    );
    const preEscalationSignalType: "native" | "browser" =
      browserSignal !== null ? "browser" : "native";
    const rawSignal: object =
      browserSignal !== null
        ? {
            appName,
            url: browserSignal.url,
            tabTitle: browserSignal.tabTitle,
            idleSeconds,
          }
        : { appName, windowTitle, idleSeconds };

    const signalKey =
      `${appName ?? ""}|${effectiveWindowTitle ?? ""}`.toLowerCase();

    const escalated = await escalationTracker.resolve({
      sessionId,
      tier1Result,
      signalType: preEscalationSignalType,
      signalKey,
      windowTitle: effectiveWindowTitle,
      task,
      distractionList,
    });

    const { classification, signalType, reasoning } = escalated;

    insertClassificationEvent({
      sessionId,
      timestamp,
      signalType,
      rawSignal,
      classification,
      reasoning,
    });

    const payload: ClassificationTickPayload = {
      sessionId,
      timestamp,
      signalType,
      classification,
    };
    BrowserWindow.getAllWindows()[0]?.webContents.send(
      "classification:tick",
      payload,
    );

    const nudgeEvent = nudgeTracker.onTick(classification, Date.now());
    if (nudgeEvent.type === "trigger") {
      const nudgePayload: NudgeTriggerPayload = {
        sessionId,
        stage: nudgeEvent.stage,
        task,
        distractedSinceSeconds: nudgeEvent.distractedSinceSeconds,
        message: messagePicker.pickNudge(
          nudgeEvent.stage,
          task,
          nudgeEvent.distractedSinceSeconds,
          nudgeEvent.escalationReason,
        ),
      };
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        "nudge:trigger",
        nudgePayload,
      );
      console.log("[nudge] trigger", nudgePayload);
    } else if (nudgeEvent.type === "clear") {
      sendNudgeClear(sessionId, messagePicker.pickReset(task));
    }

    console.log("[poller]", {
      sessionId,
      timestamp,
      appName,
      signal:
        browserSignal !== null
          ? { tabTitle: browserSignal.tabTitle, url: browserSignal.url }
          : { windowTitle },
      signalType,
      idleSeconds,
      classification,
      reasoning,
    });
  };

  const scheduler = createSerializedScheduler(tick, (err) => {
    console.error("[poller] classification tick failed:", err);
  });
  const browserSignalTrigger = createDebouncedTrigger(
    scheduler.request,
    BROWSER_SIGNAL_DEBOUNCE_MS,
  );

  const observeNativeSignal = async (): Promise<void> => {
    try {
      const win = await getActiveWindow();
      if (disposed) return;
      const signal =
        `${win?.id ?? ""}|${win?.owner.processId ?? ""}|${win?.title ?? ""}`.toLowerCase();
      if (lastObservedNativeSignal === null) {
        lastObservedNativeSignal = signal;
      } else if (signal !== lastObservedNativeSignal) {
        lastObservedNativeSignal = signal;
        scheduler.request();
      }
    } catch (err) {
      console.error("[poller] native signal observation failed:", err);
    }
  };

  const unsubscribeBrowserSignal = onBrowserSignalChange(
    browserSignalTrigger.request,
  );
  scheduler.request();
  void observeNativeSignal();
  const interval = setInterval(scheduler.request, POLL_INTERVAL_MS);
  const nativeSignalInterval = setInterval(
    () => void observeNativeSignal(),
    ACTIVE_WINDOW_CHECK_INTERVAL_MS,
  );

  return () => {
    disposed = true;
    clearInterval(interval);
    clearInterval(nativeSignalInterval);
    browserSignalTrigger.dispose();
    unsubscribeBrowserSignal();
    scheduler.dispose();
    // A distraction interval only closes on an on_task tick — if the session
    // ends while still off-task, force that close now so the row doesn't
    // dangle with ended_at = NULL forever (undercounting distracted time).
    const finalEvent = nudgeTracker.onTick("on_task", Date.now());
    if (finalEvent.type === "clear") {
      sendNudgeClear(sessionId, messagePicker.pickReset(task));
    }
  };
}
