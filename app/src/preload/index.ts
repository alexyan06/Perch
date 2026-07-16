import { contextBridge, ipcRenderer } from "electron";
import type {
  IpcApi,
  ClassificationTickPayload,
  NudgeTriggerPayload,
  NudgeClearPayload,
  SessionSummaryReadyPayload,
} from "../shared/ipc";

const api: IpcApi = {
  session: {
    start: (req) => ipcRenderer.invoke("session:start", req),
    end: (req) => ipcRenderer.invoke("session:end", req),
    getPast: (req) => ipcRenderer.invoke("session:getPast", req),
    delete: (req) => ipcRenderer.invoke("session:delete", req),
    getTrends: (req) => ipcRenderer.invoke("session:getTrends", req),
    onSummaryReady: (cb) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: SessionSummaryReadyPayload,
      ) => cb(payload);
      ipcRenderer.on("session:summaryReady", handler);
      return () => ipcRenderer.removeListener("session:summaryReady", handler);
    },
  },
  classification: {
    onTick: (cb) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: ClassificationTickPayload,
      ) => cb(payload);
      ipcRenderer.on("classification:tick", handler);
      return () => ipcRenderer.removeListener("classification:tick", handler);
    },
  },
  nudge: {
    onTrigger: (cb) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: NudgeTriggerPayload,
      ) => cb(payload);
      ipcRenderer.on("nudge:trigger", handler);
      return () => ipcRenderer.removeListener("nudge:trigger", handler);
    },
    onClear: (cb) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: NudgeClearPayload,
      ) => cb(payload);
      ipcRenderer.on("nudge:clear", handler);
      return () => ipcRenderer.removeListener("nudge:clear", handler);
    },
  },
  mascot: {
    getKeyStatus: () => ipcRenderer.invoke("mascot:getKeyStatus"),
    selectPhoto: () => ipcRenderer.invoke("mascot:selectPhoto"),
    generateBase: () => ipcRenderer.invoke("mascot:generateBase"),
    generateStage: (req) => ipcRenderer.invoke("mascot:generateStage", req),
    save: () => ipcRenderer.invoke("mascot:save"),
    getActive: () => ipcRenderer.invoke("mascot:getActive"),
    list: () => ipcRenderer.invoke("mascot:list"),
    select: (req) => ipcRenderer.invoke("mascot:select", req),
    delete: (req) => ipcRenderer.invoke("mascot:delete", req),
    getBounds: () => ipcRenderer.invoke("mascot:getBounds"),
    setSpeechBubble: (req) => ipcRenderer.invoke("mascot:setSpeechBubble", req),
  },
  permissions: {
    getStatus: () => ipcRenderer.invoke("permissions:getStatus"),
    openScreenRecordingSettings: () =>
      ipcRenderer.invoke("permissions:openScreenRecordingSettings"),
    requestAccessibility: () =>
      ipcRenderer.invoke("permissions:requestAccessibility"),
    dismissOnboarding: () =>
      ipcRenderer.invoke("permissions:dismissOnboarding"),
  },
};

contextBridge.exposeInMainWorld("api", api);
