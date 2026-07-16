import activeWin from "active-win";
import { BrowserWindow, powerMonitor } from "electron";
import { insertClassificationEvent } from "./db";
import { classifyTier1 } from "./classifier";
import { getLatestBrowserSignal } from "./ws-server";
import { createEscalationTracker } from "./escalation";
import { createNudgeTracker } from "./nudge";
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

function sendNudgeClear(sessionId: string): void {
  const clearPayload: NudgeClearPayload = { sessionId };
  BrowserWindow.getAllWindows()[0]?.webContents.send(
    "nudge:clear",
    clearPayload,
  );
  console.log("[nudge] clear", clearPayload);
}

export function startPolling(
  sessionId: string,
  config: SessionStartRequest,
): () => void {
  const { task, distractionList, approvedList } = config;
  const escalationTracker = createEscalationTracker();
  const nudgeTracker = createNudgeTracker(sessionId);

  const tick = async (): Promise<void> => {
    const win = await activeWin();
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const timestamp = new Date().toISOString();

    const appName = win?.owner.name ?? null;
    const windowTitle = win?.title ?? null;

    const isBrowser =
      appName !== null && BROWSER_APP_NAMES.includes(appName.toLowerCase());

    const browserSignal = isBrowser ? getLatestBrowserSignal() : null;
    const effectiveWindowTitle = browserSignal?.tabTitle ?? windowTitle;

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
      };
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        "nudge:trigger",
        nudgePayload,
      );
      console.log("[nudge] trigger", nudgePayload);
    } else if (nudgeEvent.type === "clear") {
      sendNudgeClear(sessionId);
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

  void tick();
  const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);

  return () => {
    clearInterval(interval);
    // A distraction interval only closes on an on_task tick — if the session
    // ends while still off-task, force that close now so the row doesn't
    // dangle with ended_at = NULL forever (undercounting distracted time).
    const finalEvent = nudgeTracker.onTick("on_task", Date.now());
    if (finalEvent.type === "clear") {
      sendNudgeClear(sessionId);
    }
  };
}
