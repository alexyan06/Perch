# IPC & Messaging Contract

Single source of truth for channel names and payload shapes across the three boundaries in this app:
renderer ↔ main (Electron IPC), main ↔ extension (local WebSocket), and main → vision API (documented separately in the `activity-classification` skill).

If you change a shape here, update both sides in the same commit. Codex sessions on `app/` and `extension/` may not share context — this file is what keeps them honest with each other.

## Conventions

- Channel names: `domain:action`, lowercase, colon-separated (e.g. `session:start`, not `startSession`).
- All payloads are JSON-serializable plain objects — no class instances, no `Date` objects (use ISO 8601 strings).
- Every event that crosses a boundary has a fixed shape below. Don't invent ad-hoc fields; add a new field here first if one is needed.

---

## Renderer → Main (via `ipcRenderer.invoke`, exposed through `preload.ts`)

### `session:start`

Request:

```ts
{ task: string; distractionList: string[]; approvedList: string[] }
```

Response:

```ts
{
  sessionId: string;
  startedAt: string;
}
```

### `session:end`

Request:

```ts
{
  sessionId: string;
}
```

Response — computed locally (`app/src/main/session-metrics.ts`), no AI call (see `docs/PRD.md` §6.5):

```ts
{
  onTaskSeconds: number;
  distractedSeconds: number; // "distraction" and "drift" folded together
  ambiguousSeconds: number;
  categoryBreakdown: Array<{ label: string; seconds: number }>; // by app/site, ranked, capped with an "Other" row
}
```

### `session:getPast`

Request: `{ limit: number }`
Response: `{ sessions: Array<PastSession> }`, where `PastSession` is:

```ts
{
  id: string;
  startedAt: string;
  endedAt: string;
  task: string;
  // Legacy sessions (ended before the stats-based summary) have these...
  summary?: string;
  nextSteps?: string[];
  // ...and sessions since have these instead. Mutually exclusive per row.
  onTaskSeconds?: number;
  distractedSeconds?: number;
  ambiguousSeconds?: number;
  categoryBreakdown?: Array<{ label: string; seconds: number }>;
}
```

### `session:delete`

Deletes a completed session and its `classification_events`/`distraction_intervals` rows (no `ON DELETE CASCADE` on those foreign keys, so main deletes children first, wrapped in a transaction). No confirmation at the IPC layer — the renderer's delete button is expected to confirm before calling this, matching the pattern already used for `mascot:delete`.

Request: `{ sessionId: string }`
Response: `{}`

### `session:getTrends`

Aggregates stats across all stats-based sessions started within the last `days` days (legacy prose-summary sessions have no numeric stats to aggregate and are excluded — same `on_task_seconds IS NOT NULL` filter `session:getPast` uses to tell the two row shapes apart). Computed with `app/src/main/session-metrics.ts`'s `aggregateSessionStats`, no AI call.

Request: `{ days: number }`
Response:

```ts
{
  sessionCount: number;
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
  categoryBreakdown: Array<{ label: string; seconds: number }>;
}
```

### `mascot:getKeyStatus`

Whether `GEMINI_API_KEY` is set in the environment (per `docs/mascot-generation.md` §9 — no in-app settings form). The renderer uses this to decide whether to show the "Customize mascot" flow or an instruction to add the key and restart.

Request: `{}`
Response: `{ hasKey: boolean }`

### `mascot:selectPhoto`

Opens a native file dialog scoped to image files. Main reads the file and holds it in memory only (never persisted) — see `docs/mascot-generation.md` §3.

Request: `{}`
Response: `{ photoPreviewDataUrl: string } | null` (`null` if the dialog was canceled or an unsupported file type was chosen)

### `mascot:generateBase`

Generates the stage-0 reference sprite from the photo selected in the prior `mascot:selectPhoto` call, post-processed per `docs/mascot-generation.md` §5. Rejects (renderer should catch and show a calm retry/choose-different-photo message) on any generation failure — network error or model refusal are not distinguished.

Request: `{}`
Response: `{ image: string }` (data URL, already post-processed)

### `mascot:generateStage`

Generates one of the 3 expression variants or the hello-wave pose, using the base sprite plus any other already-generated earlier stages as character references (e.g. `hello` references `calm`+`gentle`+`upset`+`breakdown`) — see `docs/mascot-generation.md` §3/§4. Same failure handling as `mascot:generateBase`. Callable repeatedly to regenerate a single stage without affecting the others.

Request: `{ stage: 1 | 2 | 3 | 4 }`
Response: `{ image: string }` (data URL, already post-processed)

### `mascot:save`

Writes all 5 currently-generated sprites as a **new** entry under `userData/mascots/<mascotId>/{calm,gentle,upset,breakdown,hello}.png` plus `metadata.json` (`{ createdAt }`), and selects it as the active mascot — matches the pre-library behavior where saving meant "this is now my mascot." Rejects if any of the 5 stages hasn't succeeded yet. `id` uses the same ID scheme as session IDs (`newId()` in `db.ts`).

Request: `{}`
Response: `{ id: string; savedAt: string }`

### `mascot:getActive`

Reads whichever mascot is currently selected (see `mascot:select`), used by the mascot window and Mascot page to decide whether to render the real generated sprites or fall back to the bundled placeholder. All-or-nothing: `null` if nothing is selected, or if the directory, any of the 5 files, or a read of any of them fails — never a partial mix of real and placeholder art.

Request: `{}`
Response: `{ calm: string; gentle: string; upset: string; breakdown: string; hello: string } | null` (each a data URL)

### `mascot:list`

Lists every saved mascot (newest first), plus which one (if any) is currently selected, for the mascot library/picker screen (`MascotLibrary.tsx`).

Request: `{}`
Response: `{ mascots: Array<{ id: string; createdAt: string; thumbnail: string }>; selectedId: string | null }` (`thumbnail` is the calm stage, a data URL)

### `mascot:select`

Sets which saved mascot the real mascot window should use. `id: null` means "use the bundled default" — a real, selectable option, not just an absence.

Request: `{ id: string | null }`
Response: `{}`

### `mascot:delete`

Deletes a saved mascot's directory. If it was the currently selected one, the selection clears to the default rather than silently falling onto a different saved mascot the user didn't choose.

Request: `{ id: string }`
Response: `{}`

### Mascot dragging and control side

The mascot window always starts bottom-right of the primary display — there's no corner picker. The visible 120px mascot art is the native `-webkit-app-region: drag` target, so the OS handles repositioning without any `mascot:drag*` IPC surface. The window's `moved` event (fired when a native drag finishes) persists its position to `userData/mascot-position.json` as `{x, y}`, via `app/src/main/mascot-position.ts`.

The adjacent X control remains a `no-drag` surface. `mascot:getButtonSide` returns `"left"` or `"right"` for initial renderer layout, and `mascot:buttonSideChanged` pushes the new side after a move. Main derives it from the mascot bounds and the work-area midpoint of the display containing the mascot: the X sits on the inward side (right when the mascot is in the display's left half, and left otherwise).

`nudge:trigger` and `nudge:clear` include a final `message` string chosen in main. Custom mascots may have a saved voice profile and receive a fresh task-specific message pack at session start; all generation failures fall back to the bundled neutral templates.

### `permissions:getStatus`

Checked fresh every call, never cached — macOS only, always reports both `true` on other platforms (see PRD §8, `docs/mascot-generation.md`-style verified-not-assumed note: `systemPreferences.getMediaAccessStatus`/`isTrustedAccessibilityClient` are both `@platform darwin`).

Request: `{}`
Response: `{ screenRecording: boolean; accessibility: boolean; onboardingDismissed: boolean }`

### `permissions:openScreenRecordingSettings`

Opens System Settings directly to the Screen Recording pane (`shell.openExternal` to an `x-apple.systempreferences:` deep link) — there's no programmatic OS prompt for this permission, unlike Accessibility.

Request: `{}`
Response: `{}`

### `permissions:requestAccessibility`

Triggers the native OS permission prompt for Accessibility access.

Request: `{}`
Response: `{ granted: boolean }`

### `permissions:dismissOnboarding`

Persists the user's choice to continue without granting permissions, so the onboarding gate doesn't reappear on every launch — it still reappears if permissions are missing and this was never called.

Request: `{}`
Response: `{}`

---

## Main → Renderer (via `webContents.send`, listened on via preload-exposed `on`)

### `classification:tick`

Fired on every classification result, used to update the live session view.

```ts
{
  sessionId: string;
  timestamp: string;
  signalType: "native" | "browser" | "vision";
  classification: "on_task" | "distraction" | "drift" | "ambiguous";
}
```

### `nudge:trigger`

Fired when a nudge stage is entered or escalates.

```ts
{
  sessionId: string;
  stage: 1 | 2 | 3;
  task: string;
  distractedSinceSeconds: number;
}
```

### `nudge:clear`

Fired the moment classification returns to on-task and the stage resets to 0.

```ts
{
  sessionId: string;
}
```

### `session:summaryReady`

Sent to the main window specifically (not broadcast) the moment `session:end` finishes computing a summary. Exists because a session ends by clicking the mascot window, not the main window — `session:end`'s own response goes back to the mascot window's renderer, which has nowhere to show a summary, so the main window needs its own independent copy of this data pushed to it to know a session just ended at all.

```ts
{
  sessionId: string;
  task: string;
  onTaskSeconds: number;
  distractedSeconds: number;
  ambiguousSeconds: number;
  categoryBreakdown: Array<{ label: string; seconds: number }>;
}
```

---

## Extension → Main (WebSocket, `ws://localhost:WS_PORT`)

Extension is a client; main runs the WebSocket server. Port comes from `.env` (`WS_PORT`, default `8743`), must match the value baked into the extension build — see §2 below.

### `tab:update` (extension → main, sent on tab focus change or URL change in the active tab)

```ts
{
  type: "tab:update";
  url: string;
  tabTitle: string;
  timestamp: string;
}
```

### `connection:hello` (extension → main, sent immediately on WebSocket open)

```ts
{
  type: "connection:hello";
  extensionVersion: string;
}
```

### `connection:ack` (main → extension, reply to `connection:hello`)

```ts
{
  type: "connection:ack";
  serverVersion: string;
}
```

**Reconnection rule:** the extension must retry connecting every 5s if the WebSocket closes or fails to open (the Electron app may not be running, or may have restarted). Main does not need to do anything special on the server side beyond accepting new connections — no session/auth state is tied to a particular WebSocket connection.

---

## Open question to resolve before implementing

None currently — if a new field or channel is needed mid-build, add it here in the same PR/commit as the code that needs it, don't let code and this doc drift apart.
