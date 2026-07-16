import { join } from "path";
import dotenv from "dotenv";
// __dirname here is app/out/main at runtime — resolve up to the repo root's
// .env regardless of the process's cwd, since that varies by how Electron
// itself was launched (differs between `npm run dev` and a direct binary launch).
dotenv.config({ path: join(__dirname, "../../../.env") });

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFileSync } from "fs";
import { extname } from "path";
import type {
  SessionStartRequest,
  SessionStartResponse,
  SessionEndRequest,
  SessionEndResponse,
  SessionGetPastRequest,
  SessionGetPastResponse,
  SessionDeleteRequest,
  SessionGetTrendsRequest,
  SessionGetTrendsResponse,
  MascotGetKeyStatusResponse,
  MascotSelectPhotoResponse,
  MascotGenerateBaseResponse,
  MascotGenerateStageRequest,
  MascotGenerateStageResponse,
  MascotSaveResponse,
  MascotGetActiveResponse,
  MascotListResponse,
  MascotSelectRequest,
  MascotDeleteRequest,
  MascotGetBoundsResponse,
  MascotSetSpeechBubbleRequest,
  PermissionsGetStatusResponse,
  PermissionsRequestAccessibilityResponse,
  SessionSummaryReadyPayload,
} from "../shared/ipc";
import {
  createSession,
  endSession,
  getPastSessions,
  deleteSession,
  getSessionStatsSince,
} from "./db";
import { startPolling } from "./poller";
import { startWsServer } from "./ws-server";
import { generateEndOfSessionSummary } from "./summary";
import { aggregateSessionStats } from "./session-metrics";
import {
  setSelectedPhoto,
  getSelectedPhotoPreviewDataUrl,
  generateBaseSprite,
  generateStage,
  getStagesForSaving,
} from "./mascot-setup";
import {
  saveNewMascot,
  getActiveMascotImages,
  listMascots,
  getSelectedMascotId,
  selectMascot,
  deleteMascot,
  migrateLegacyMascotIfNeeded,
} from "./mascot-library";
import {
  getPermissionStatus,
  openScreenRecordingSettings,
  requestAccessibility,
  isOnboardingDismissed,
  dismissOnboarding,
} from "./permissions";
import {
  getMascotWindowBounds,
  saveMascotPosition,
  MASCOT_WINDOW_WIDTH,
  MASCOT_WINDOW_HEIGHT,
  MASCOT_WINDOW_EXPANDED_HEIGHT,
} from "./mascot-position";

let stopPolling: (() => void) | null = null;
let mainWindow: BrowserWindow | null = null;
let mascotWindow: BrowserWindow | null = null;
let mascotSpeechState:
  | {
      compactBounds: { x: number; y: number; width: number; height: number };
      placement: "above" | "below";
    }
  | null = null;
let suppressMascotMoveSave = false;

ipcMain.handle(
  "session:start",
  (_e, req: SessionStartRequest): SessionStartResponse => {
    const { id, startedAt } = createSession(
      req.task,
      req.distractionList,
      req.approvedList,
    );
    stopPolling?.();
    stopPolling = startPolling(id, req);
    mascotWindow?.close();
    mascotWindow = createMascotWindow(id);
    mainWindow?.hide();
    return { sessionId: id, startedAt };
  },
);

ipcMain.handle(
  "session:end",
  async (_e, req: SessionEndRequest): Promise<SessionEndResponse> => {
    stopPolling?.();
    stopPolling = null;
    mascotWindow?.close();
    mascotWindow = null;
    mainWindow?.show();

    const endedAt = new Date().toISOString();

    const {
      task,
      onTaskSeconds,
      distractedSeconds,
      ambiguousSeconds,
      categoryBreakdown,
    } = generateEndOfSessionSummary(req.sessionId, endedAt);

    endSession(req.sessionId, endedAt, {
      onTaskSeconds,
      distractedSeconds,
      ambiguousSeconds,
      categoryBreakdown,
    });

    // Sessions end by clicking the mascot window, not the main window, so
    // the main window's renderer never sees session:end's own response —
    // it needs its own copy of this data pushed to it directly to have
    // anywhere to show a summary at all.
    mainWindow?.webContents.send("session:summaryReady", {
      sessionId: req.sessionId,
      task,
      onTaskSeconds,
      distractedSeconds,
      ambiguousSeconds,
      categoryBreakdown,
    } satisfies SessionSummaryReadyPayload);

    return {
      onTaskSeconds,
      distractedSeconds,
      ambiguousSeconds,
      categoryBreakdown,
    };
  },
);

ipcMain.handle(
  "session:getPast",
  (_e, req: SessionGetPastRequest): SessionGetPastResponse => ({
    sessions: getPastSessions(req.limit),
  }),
);

ipcMain.handle("session:delete", (_e, req: SessionDeleteRequest): void => {
  deleteSession(req.sessionId);
});

ipcMain.handle(
  "session:getTrends",
  (_e, req: SessionGetTrendsRequest): SessionGetTrendsResponse => {
    const sinceIso = new Date(
      Date.now() - req.days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const rows = getSessionStatsSince(sinceIso);
    const stats = aggregateSessionStats(rows);
    return { sessionCount: rows.length, ...stats };
  },
);

ipcMain.handle(
  "mascot:getKeyStatus",
  (): MascotGetKeyStatusResponse => ({
    hasKey: process.env["OPENAI_API_KEY"] !== undefined,
  }),
);

const PHOTO_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

ipcMain.handle(
  "mascot:selectPhoto",
  async (): Promise<MascotSelectPhotoResponse | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
        },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const mimeType = PHOTO_MIME_TYPES[extname(filePath).toLowerCase()];
    if (mimeType === undefined) return null;

    setSelectedPhoto(readFileSync(filePath), mimeType);
    const preview = getSelectedPhotoPreviewDataUrl();
    if (preview === null) return null;

    return { photoPreviewDataUrl: preview };
  },
);

ipcMain.handle(
  "mascot:generateBase",
  async (): Promise<MascotGenerateBaseResponse> => ({
    image: await generateBaseSprite(),
  }),
);

const STAGE_NAME_BY_NUMBER: Record<
  1 | 2 | 3,
  "gentle" | "upset" | "breakdown"
> = {
  1: "gentle",
  2: "upset",
  3: "breakdown",
};

ipcMain.handle(
  "mascot:generateStage",
  async (
    _e,
    req: MascotGenerateStageRequest,
  ): Promise<MascotGenerateStageResponse> => ({
    image: await generateStage(STAGE_NAME_BY_NUMBER[req.stage]),
  }),
);

ipcMain.handle("mascot:save", (): MascotSaveResponse => {
  const stages = getStagesForSaving();
  if (stages === null) {
    throw new Error("[mascot:save] not all 4 stages are ready yet");
  }
  return saveNewMascot(stages);
});

ipcMain.handle("mascot:getActive", (): MascotGetActiveResponse | null =>
  getActiveMascotImages(),
);

ipcMain.handle(
  "mascot:list",
  (): MascotListResponse => ({
    mascots: listMascots(),
    selectedId: getSelectedMascotId(),
  }),
);

ipcMain.handle("mascot:select", (_e, req: MascotSelectRequest) => {
  selectMascot(req.id);
});

ipcMain.handle("mascot:delete", (_e, req: MascotDeleteRequest) => {
  deleteMascot(req.id);
});

ipcMain.handle("mascot:getBounds", (): MascotGetBoundsResponse | null => {
  if (!mascotWindow) return null;
  return mascotWindow.getBounds();
});

ipcMain.handle(
  "mascot:setSpeechBubble",
  (_e, req: MascotSetSpeechBubbleRequest): void => {
    if (!mascotWindow) return;

    if (req.placement === null) {
      if (mascotSpeechState === null) return;
      suppressMascotMoveSave = true;
      mascotWindow.setBounds(mascotSpeechState.compactBounds);
      suppressMascotMoveSave = false;
      mascotSpeechState = null;
      return;
    }

    const compactBounds = mascotSpeechState?.compactBounds ?? {
      ...mascotWindow.getBounds(),
      height: MASCOT_WINDOW_HEIGHT,
    };
    const expansion = MASCOT_WINDOW_EXPANDED_HEIGHT - MASCOT_WINDOW_HEIGHT;
    mascotSpeechState = { compactBounds, placement: req.placement };

    suppressMascotMoveSave = true;
    mascotWindow.setBounds({
      ...compactBounds,
      y:
        req.placement === "above"
          ? compactBounds.y - expansion
          : compactBounds.y,
      height: MASCOT_WINDOW_EXPANDED_HEIGHT,
    });
    suppressMascotMoveSave = false;
  },
);

ipcMain.handle(
  "permissions:getStatus",
  (): PermissionsGetStatusResponse => ({
    ...getPermissionStatus(),
    onboardingDismissed: isOnboardingDismissed(),
  }),
);

ipcMain.handle("permissions:openScreenRecordingSettings", async () => {
  await openScreenRecordingSettings();
});

ipcMain.handle(
  "permissions:requestAccessibility",
  (): PermissionsRequestAccessibilityResponse => ({
    granted: requestAccessibility(),
  }),
);

ipcMain.handle("permissions:dismissOnboarding", () => {
  dismissOnboarding();
});

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });
  mainWindow = win;

  win.on("ready-to-show", () => win.show());

  if (process.env["ELECTRON_RENDERER_URL"] !== undefined) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function createMascotWindow(sessionId: string): BrowserWindow {
  const { x, y } = getMascotWindowBounds();

  const win = new BrowserWindow({
    width: MASCOT_WINDOW_WIDTH,
    height: MASCOT_WINDOW_HEIGHT,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    // The mascot is an overlay the user interacts with while some OTHER app
    // is active (that's the whole product). Without acceptFirstMouse, macOS
    // consumes the entire first click-or-drag on an inactive window just to
    // activate it — the renderer never sees the gesture, so drags randomly
    // "don't grab" and ending a session takes two clicks (confirmed
    // empirically with real CGEvent cursor input; synthetic test events
    // bypass activation and can't catch this). focusable: false goes
    // further: the window never takes focus at all, so grabbing the mascot
    // doesn't yank focus from the user's work app — which also keeps
    // active-win from misreading a drag as the user switching to "Electron"
    // and feeding that into classification.
    acceptFirstMouse: true,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  // The mascot is dragged via native `-webkit-app-region: drag` (see
  // Mascot.tsx's DragHandle) rather than a custom pointer-tracked/IPC-driven
  // setPosition loop, which was tried first and abandoned: it kept getting
  // silently intercepted by macOS's window-tiling gesture specifically in
  // the top portion of the screen, with no reliable code-level exemption
  // found. Native dragging hands the whole gesture to the OS, so "moved" (fired once when
  // a native drag finishes, not continuously during it) is now the sole
  // path for detecting where the user left it and persisting that.
  win.on("moved", () => {
    if (suppressMascotMoveSave) return;
    const [x, y] = win.getPosition();
    if (mascotSpeechState !== null) {
      mascotSpeechState.compactBounds = {
        ...mascotSpeechState.compactBounds,
        x,
        y:
          mascotSpeechState.placement === "above"
            ? y + MASCOT_WINDOW_EXPANDED_HEIGHT - MASCOT_WINDOW_HEIGHT
            : y,
      };
      saveMascotPosition({
        x: mascotSpeechState.compactBounds.x,
        y: mascotSpeechState.compactBounds.y,
      });
      return;
    }
    saveMascotPosition({ x, y });
  });

  win.on("ready-to-show", () => win.show());

  const hash = `mascot?sessionId=${encodeURIComponent(sessionId)}`;
  if (process.env["ELECTRON_RENDERER_URL"] !== undefined) {
    win.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#${hash}`);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"), { hash });
  }

  return win;
}

app.whenReady().then(() => {
  migrateLegacyMascotIfNeeded();
  startWsServer();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
