// Renderer → Main (invoke) payloads

export interface SessionStartRequest {
  task: string;
  distractionList: string[];
  approvedList: string[];
}

export interface SessionStartResponse {
  sessionId: string;
  startedAt: string; // ISO 8601
}

export interface SessionEndRequest {
  sessionId: string;
}

export interface CategoryDuration {
  label: string;
  seconds: number;
}

export interface SessionEndResponse {
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
  categoryBreakdown: CategoryDuration[];
}

export interface SessionGetPastRequest {
  limit: number;
}

export interface SessionDeleteRequest {
  sessionId: string;
}

export interface SessionGetTrendsRequest {
  days: number;
}

export interface SessionGetTrendsResponse {
  sessionCount: number;
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
  categoryBreakdown: CategoryDuration[];
}

export interface PastSession {
  id: string;
  startedAt: string; // ISO 8601
  endedAt: string; // ISO 8601
  task: string;
  // Legacy sessions (created before the stats-based summary) have these...
  summary?: string;
  nextSteps?: string[];
  // ...and sessions since have these instead. Mutually exclusive per row.
  onTaskSeconds?: number;
  distractedSeconds?: number;
  ambiguousSeconds?: number;
  categoryBreakdown?: CategoryDuration[];
}

export interface SessionGetPastResponse {
  sessions: PastSession[];
}

export interface MascotGetKeyStatusResponse {
  hasKey: boolean;
}

export interface MascotSelectPhotoResponse {
  photoPreviewDataUrl: string;
}

export interface MascotGenerateBaseResponse {
  image: string; // data URL, post-processed
}

export interface MascotGenerateStageRequest {
  stage: 1 | 2 | 3 | 4;
}

export interface MascotGenerateStageResponse {
  image: string; // data URL, post-processed
}

export interface MascotSaveResponse {
  id: string;
  savedAt: string; // ISO 8601
}

export interface MascotGetActiveResponse {
  calm: string;
  gentle: string;
  upset: string;
  breakdown: string;
  hello: string;
}

export interface MascotListEntry {
  id: string;
  createdAt: string; // ISO 8601
  thumbnail: string; // calm stage, data URL
}

export interface MascotListResponse {
  mascots: MascotListEntry[];
  selectedId: string | null;
}

export interface MascotSelectRequest {
  id: string | null;
}

export interface MascotDeleteRequest {
  id: string;
}

export interface MascotGetBoundsResponse {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Which side of the mascot should hold the session-ending control. The value
// names the button's side, rather than the half of the display the mascot is
// on, so the renderer can apply it directly to its layout.
export type MascotButtonSide = "left" | "right";

export interface MascotSetSpeechBubbleRequest {
  placement: "above" | "below" | null;
}

export interface PermissionsGetStatusResponse {
  screenRecording: boolean;
  accessibility: boolean;
  onboardingDismissed: boolean;
}

export interface PermissionsRequestAccessibilityResponse {
  granted: boolean;
}

// Main → Renderer (push event) payloads

export interface ClassificationTickPayload {
  sessionId: string;
  timestamp: string; // ISO 8601
  signalType: "native" | "browser" | "vision";
  classification: "on_task" | "distraction" | "drift" | "ambiguous" | "paused";
}

export interface NudgeTriggerPayload {
  sessionId: string;
  stage: 1 | 2 | 3;
  task: string;
  distractedSinceSeconds: number;
  message: string;
}

export interface NudgeClearPayload {
  sessionId: string;
  message: string;
}

export interface SessionSummaryReadyPayload {
  sessionId: string;
  task: string;
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
  categoryBreakdown: CategoryDuration[];
}

// Bridge shape exposed via contextBridge

export interface IpcApi {
  session: {
    start(req: SessionStartRequest): Promise<SessionStartResponse>;
    end(req: SessionEndRequest): Promise<SessionEndResponse>;
    getPast(req: SessionGetPastRequest): Promise<SessionGetPastResponse>;
    delete(req: SessionDeleteRequest): Promise<void>;
    getTrends(req: SessionGetTrendsRequest): Promise<SessionGetTrendsResponse>;
    onSummaryReady(
      cb: (payload: SessionSummaryReadyPayload) => void,
    ): () => void;
  };
  classification: {
    onTick(cb: (payload: ClassificationTickPayload) => void): () => void;
  };
  nudge: {
    onTrigger(cb: (payload: NudgeTriggerPayload) => void): () => void;
    onClear(cb: (payload: NudgeClearPayload) => void): () => void;
  };
  mascot: {
    getKeyStatus(): Promise<MascotGetKeyStatusResponse>;
    selectPhoto(): Promise<MascotSelectPhotoResponse | null>;
    generateBase(): Promise<MascotGenerateBaseResponse>;
    generateStage(
      req: MascotGenerateStageRequest,
    ): Promise<MascotGenerateStageResponse>;
    save(): Promise<MascotSaveResponse>;
    getActive(): Promise<MascotGetActiveResponse | null>;
    list(): Promise<MascotListResponse>;
    select(req: MascotSelectRequest): Promise<void>;
    delete(req: MascotDeleteRequest): Promise<void>;
    getBounds(): Promise<MascotGetBoundsResponse | null>;
    getButtonSide(): Promise<MascotButtonSide>;
    onButtonSideChange(cb: (side: MascotButtonSide) => void): () => void;
    setSpeechBubble(req: MascotSetSpeechBubbleRequest): Promise<void>;
  };
  permissions: {
    getStatus(): Promise<PermissionsGetStatusResponse>;
    openScreenRecordingSettings(): Promise<void>;
    requestAccessibility(): Promise<PermissionsRequestAccessibilityResponse>;
    dismissOnboarding(): Promise<void>;
  };
}
