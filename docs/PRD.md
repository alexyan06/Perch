# Perch — Product Requirements Document

**Status:** v1 scoping complete, ready for implementation
**Owner:** Alex
**Last updated:** 2026-07-08

---

## 1. Problem Statement

Existing focus/productivity tools fall into two camps: dumb timers (Pomodoro apps with no awareness of what you're actually doing) or heavy-handed blockers (hard-block specific sites/apps, easy to circumvent, no nuance). Neither understands the actual _task_ you declared for a session, and neither can tell the difference between "on Chrome reading documentation" and "on Chrome watching YouTube."

This tool sits between those two: it knows what you said you're working on, watches lightweight signals about what you're actually doing, escalates to deeper inspection only when it's genuinely ambiguous, nudges you back on track with increasing urgency if you drift, and gives you an honest summary at the end — not just "you worked for 50 minutes" but "here's what you actually did, and here's what's logically next."

## 2. Goals

- Ship a tool Alex will actually use daily during work sessions (PNC internship work, Shopify prep, side projects, schoolwork).
- Build something portfolio-worthy that demonstrates real systems-design judgment (cost-aware AI usage, OS-level permission boundaries, sensible escalation logic) — not just "wrapped an LLM API call in a UI."
- Use this build as the vehicle for getting genuinely good at Codex (`.codex`, skills, hooks, subagents) — see companion doc `docs/codex-code-workflow.md`.

## 3. Non-Goals (v1)

- No local/on-device model — cloud vision API only for v1. On-device is an explicit, designed-for-later option (see §9), not a v1 deliverable.
- No browsers other than Chrome (extension targets Manifest V3 / Chrome first; Firefox/Safari/Arc deferred).
- No mobile companion app.
- No team/multi-user features, no shared dashboards, no manager-visible reporting.
- ~~No historical analytics beyond the single most-recent session's summary (e.g. no "your week in focus" charts in v1).~~ Implemented — see §6.5.
- No nudge override/dismiss button (see §6.4 — explicit decision to gather false-positive data first).

## 4. User & Core Loop

**User:** Alex, solo developer/CS student, multiple concurrent work contexts (PNC internship, Shopify prep, schoolwork, side projects), heavy browser user, already uses voice-to-text and prefers structured/concise tools over abstract ones.

**Core loop, end to end:**

1. User opens the app, types: (a) what they're working on this session, (b) optional distraction keywords/sites (e.g. "youtube, reddit, twitter").
2. User clicks Start. App begins monitoring in the background (system tray icon, app can be minimized/hidden).
3. Every ~5–10s, the app captures a cheap signal (active app name + window title, or active browser tab URL/title via extension) and classifies it as on-task / distraction-match / ambiguous against the declared task and distraction list.
4. Ambiguous signals that persist ~60s get escalated to a screenshot + vision call to resolve what's actually on screen.
5. A small always-on-top mascot companion sits in a screen corner for the whole session and visibly reacts to focus state in real time — calm/happy while on-task, increasingly distressed as distraction sustains, escalating toward a "broken down" state at the worst stage. Returning to task resets it back to calm immediately; the distraction interval is still logged regardless.
6. User clicks End Session (or closes the app). App computes an end-of-session breakdown locally (no AI call) from the session's own logged classification events: on-task vs. distracted vs. ambiguous time, and time spent per app/site.
7. Breakdown + session log saved locally (SQLite). User can review past sessions individually, delete ones they don't want, and see a rolling last-7-days trends summary aggregated across sessions atop the list.

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Electron App (TypeScript)                                   │
│                                                               │
│  Main process (Node.js, has OS access):                     │
│   - active-win          → active app name + window title    │
│   - powerMonitor        → idle time detection                │
│   - desktopCapturer     → screenshot of active window        │
│   - local WebSocket server (port 8743) ← extension connects  │
│   - better-sqlite3      → session/event log storage          │
│   - vision API client   → tier-1 vision escalation only      │
│   - OpenAI image client → opt-in custom mascot generation    │
│                                                               │
│  Renderer process (React + TS + Tailwind + shadcn/ui):       │
│   - Session start screen (task + distraction/approved lists)│
│   - Mascot companion window (always-on-top, repositionable,  │
│     reacts live)                                              │
│   - End-of-session summary view (computed stats + charts)    │
│   - Past sessions list (+ delete, + last-7-days trends)      │
│   - Mascot library (save/select/delete/generate)             │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ ws://localhost:8743
                          │
┌─────────────────────────────────────────────────────────────┐
│ Chrome Extension (Manifest V3)                              │
│  - Reads active tab URL + title on tab change/focus         │
│  - Sends to local Electron app via WebSocket                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
     ┌──────────────────────────┐   ┌───────────────────────────┐
     │ OpenAI vision API (cloud)│   │ OpenAI image API (cloud)  │
     │  - text classification   │   │  - custom mascot pixel-art│
     │  - vision escalation     │   │    generation (opt-in)    │
     └──────────────────────────┘   └───────────────────────────┘
```

End-of-session summaries and cross-session trends are computed locally from SQLite — no API call for either. See §6.5.

**Why a desktop shell at all:** the core feature — observing the active window/app across the whole OS, not just one browser tab — is something a website is architecturally forbidden from doing (browser sandboxing). A desktop app gets OS-level permission (after explicit user consent — see §8) to ask "what's focused right now," "how long has input been idle," and "take a screenshot," which a web page categorically cannot do in the background. The Electron shell is the thing that unlocks this; everything else (React UI) is otherwise ordinary web code.

**Why Electron over Tauri:** Tauri produces smaller, more efficient binaries, but its no-Rust JS API doesn't have first-party coverage for active-window-title detection or idle detection (screenshot capture does have a usable community plugin, `tauri-plugin-screenshots`). Electron's npm ecosystem (`active-win`, built-in `powerMonitor`, built-in `desktopCapturer`) covers all three OS hooks this app needs without writing any Rust. Given the explicit constraint of staying in TypeScript end-to-end, Electron removes the one variable that could stall the build mid-way.

## 6. Feature Specification

### 6.1 Session Setup

- Text input: task description (free text)
- Text input: distraction list (comma-separated keywords/domains, optional — explicit blocklist)
- Text input: approved list (comma-separated keywords/domains, optional — explicit allowlist; things the user knows are part of the task, e.g. "docs.python.org, linear.app, figma")
- "Start Session" button → begins monitoring, starts session timer

Both lists are optional and serve opposite purposes: the distraction list short-circuits to `distraction`, the approved list short-circuits to `on_task`. Anything matching neither falls through to ambiguous → tier 2/3. The approved list exists specifically to shrink the ambiguous middle ground, since vision escalation (tier 3) is the one part of the pipeline with real per-call API cost — see §6.2.

### 6.2 Monitoring & Classification

**Signal tiers:**

1. **Cheap signal (native):** `active-win` returns `{ owner: appName, title: windowTitle }` on each tick.
2. **Cheap signal (browser):** extension pushes `{ url, tabTitle }` over WebSocket whenever the active tab changes or the browser window regains focus.
3. **Classification pass (rule-based, instant, no API call):** check cheap signal against the user's distraction list (substring/domain match) — if matched → `distraction`, skip to §6.3. Then check against the user's approved list — if matched → `on_task`, no further action. Then check against the declared task's own keywords (e.g. window title contains a project name matching the task) — if matched → `on_task`, no further action.
4. **Ambiguous case:** signal doesn't clearly match the distraction list, approved list, or task (e.g. generic "Google Chrome" with no extension data yet, or a window title that doesn't obviously relate to any of the three). If ambiguous for ≥60 continuous seconds → escalate.
5. **Vision escalation:** capture screenshot of the active window (`desktopCapturer`, scoped to the focused window, not full screen) → send to the vision API along with the declared task and distraction list → get classification back (on-task / distraction / drift, with brief reasoning).

**Tick rate:** 5–10s for cheap-signal polling. Once a distraction state is active, tighten the recheck loop to 15–30s (faster recovery detection, since there's no manual override in v1 — see §6.4).

**Drift detection:** even apps/sites not on the explicit distraction list can be flagged if the vision/text classification determines the content doesn't relate to the declared task. This is the main reason classification can't be pure keyword matching — a static blocklist alone misses "technically not blocked, but not what you said you were doing."

### 6.3 Mascot Reaction / Escalation Logic

The mascot _is_ the nudge mechanism — there is no separate banner/notification UI. Its visual/animation state is a direct function of the current nudge stage.

There is no OS-level notification anywhere in this flow — every stage is delivered entirely inside the mascot window, including the reminder text at every stage. This is deliberate: routing the task reminder through the character ("in voice," via a speech bubble) instead of a generic OS popup is what makes the companion read as a consistent presence instead of a gimmick bolted onto a normal notification system.

| Stage          | Trigger                                               | Mascot state                                                                                                                                                                             |
| -------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — On-task    | Default / classification resolves on-task             | Calm, idle/content animation                                                                                                                                                             |
| 1 — Gentle     | Distraction detected (immediate)                      | Notices — perks up, mildly concerned expression, brief neutral speech bubble (e.g. "You said you were working on: {task}.")                                                              |
| 2 — Noticeable | Sustained 20s, or relapse after Stage 1 reset         | Visibly upset/angry animation + a short speech bubble from the mascot itself (e.g. "hey... weren't we doing {task}?")                                                                    |
| 3 — Direct     | Sustained 60s, or repeated relapse pattern in-session | "Breaking down" animation (crying/angry/falling-apart — art direction TBD) + speech bubble restating the literal declared task ("You said you wanted to: {task} — it's been {duration}") |

Each stage draws its line from a small pool of pre-written variants (see `app/src/renderer/src/mascot-messages.ts`) rather than one fixed sentence, picked at random on each transition into that stage, so repeat escalations within a session don't read as a stuck recording. Every bubble — stage 1 through 3, and the reset line below — is transient: it shows for a few seconds after the transition, then clears, so talking stays tied to the moment something changed rather than becoming a permanent status readout.

- **Reset condition:** any classification tick that resolves to on-task immediately resets the mascot to calm (stage 0) — no decay timer, instant forgiveness in the moment. This reset also gets its own brief, calm speech-bubble line acknowledging the return (e.g. "Back on: {task}."), drawn from the same kind of pool, not just a silent snap back to idle.
- **Logging (independent of mascot state):** every distraction interval — start time, end time, duration, max stage reached — is written to SQLite regardless of reset, so the end-of-session summary reflects true total distracted time even though in-the-moment reaction is forgiving.

### 6.4 No Override (v1 explicit decision)

There is no dismiss/snooze control on the mascot in v1. This is intentional: the goal is to gather real false-positive-rate data before designing an override UX. Known consequence to monitor: since the only way out of a flagged state is the next classification tick seeing you back on-task, a false positive can leave the mascot visibly upset for the length of one check interval. The tightened 15–30s recheck loop during active distraction states exists specifically to bound how long that can last. If real usage shows this is too annoying, a v1.1 patch (not a full v2) should add a lightweight override.

**Revisited and reaffirmed, 2026-07-08:** after nudge escalation was sped up considerably (stage 1 now instant, stage 3 at 60s instead of 5 minutes — see §6.3), the case for an override got a real second look, since a false positive now bites much faster than when this decision was first made. Walked through what an override would actually do, what gesture would trigger it, and whether it needed a rate limit — and the conclusion was still no override. Recorded here so this isn't re-litigated from scratch next time the question comes up.

### 6.5 End-of-Session Summary

- Triggered by "End Session" or app close.
- **Computed, not AI-generated.** No AI call — the summary is purely arithmetic over the session's own `classification_events`, computed in `app/src/main/session-metrics.ts`. Removing this call was a deliberate simplification: a prose summary of a single session's structured data didn't need model reasoning, and cutting it removes one of the app's two AI call sites entirely (the other, vision escalation, still exists — see §6.2).
- Two computed breakdowns, both shown as charts (per the `dataviz` skill, consulted when these were designed — a pie chart was considered and rejected in favor of a single horizontal stacked bar, which is what the skill's own form guidance calls for on a 3-category part-to-whole split):
  1. **On-task / distracted / ambiguous time**, a status-colored (good/critical/warning) horizontal stacked bar. `drift` and `distraction` both fold into "distracted" — matches how the nudge state machine already treats them identically for escalation purposes (§6.3); only `ambiguous` gets its own bucket.
  2. **Time by app/site**, a ranked bar chart (one hue — identity comes from the label, not the color) built by attributing the time between consecutive classification ticks to whichever app/site was active at that tick, extracted from the tick's `raw_signal` (domain from `url` if present, else `appName`). Capped to the top ~8 entries, the rest folded into "Other."
- Saved to SQLite alongside the raw session log (see §7); viewable later from the past-sessions list. Sessions created before this change keep their original AI-written prose summary rather than losing it — the past-sessions list shows whichever format a given row actually has.
- **Cross-session trends.** The same two computed breakdowns, aggregated across every stats-based session started in the last 7 days (`session:getTrends`), shown atop the past-sessions list — reuses the exact same chart components as a single session's summary, since the aggregate response is deliberately shaped identically. Legacy prose-summary sessions have no numeric stats and are excluded from the aggregate. Fixed 7-day window in v1, no date-range picker.

### 6.6 Active-Session UI — Always-Visible Mascot Companion

The active-session UI is a small, always-on-top mascot window pinned to a screen corner for the entire session. Unlike a typical productivity tool, **the UI is meant to be present and emotionally legible the whole time** — its expression is the status display.

- **Small, persistent footprint:** a frameless, transparent `BrowserWindow` (sprite-sized, not a dashboard) that stays on top of other windows but out of the way of active work — a corner, not the center of the screen. The session-start and summary screens remain full-size; only the active-monitoring state is the mascot.
- **State is the signal:** the mascot has no separate status text or activity feed — its animation/expression directly encodes the current nudge stage (calm → noticing → upset → breaking down, per §6.3). Elapsed time can be shown on hover/click, not as persistent on-screen text.
- **Reactions scale with stage:** stage 0–1 are subtle (idle animation, a perked-up look) so the mascot doesn't compete for attention while the user is on-task; stage 2–3 are intentionally more visually arresting (agitation, "breaking down") since at that point re-grabbing attention is the explicit goal.
- **Calm is still the default state:** most of a session should show the mascot idle/content, not reacting — escalation should read as earned, not constant, or the companion stops meaning anything.
- **Repositionable, not fixed to one corner:** starts bottom-right of the primary display — no corner picker, just this one default. The default position can get in the way of things the user actually needs to click, so hovering the mascot reveals a small "Drag to move" handle above the character — grab that (not the character itself) and drag it anywhere, including onto a second physically-connected display. This is native OS window dragging (`-webkit-app-region: drag`), not a custom pointer-tracked one: a custom `screen.getCursorScreenPoint()`-driven `setPosition` loop was tried first and abandoned after it kept getting silently intercepted by macOS's window-tiling gesture specifically in the top ~25% of the screen, with no reliable code-level exemption found — native dragging hands the whole gesture to the OS instead of fighting it. The tradeoff: a drag region ignores all pointer events including click, so it can't double as the click-to-end-session target the way the whole character used to — hence the separate small handle rather than "grab the character anywhere." The dragged-to position persists across sessions (`userData/mascot-position.json`, see `app/src/main/mascot-position.ts`, saved from the window's native `moved` event) and falls back to the original default if it's no longer on any connected display (e.g. an external monitor got disconnected).
- **Non-activating window — first grab always registers, and grabbing never steals focus:** the mascot window is created with `acceptFirstMouse: true` and `focusable: false`. Both exist because the user interacting with the mascot is, by definition, active in some _other_ app at that moment: without `acceptFirstMouse`, macOS consumes the entire first click-or-drag on an inactive window just to activate it — the gesture never reaches the mascot at all, making drags randomly "not grab" and session-ending take two clicks (found empirically with real OS-cursor input; synthetic test events bypass activation and can't reproduce it). `focusable: false` additionally keeps the mascot from ever taking focus, so grabbing it doesn't pull the user out of their work app — which also keeps `active-win` from misreading a mascot interaction as an app switch and feeding that into classification. The window is also created with `fullscreenable: false` — kept even though it turned out not to be sufficient on its own to fix the top-of-screen drag problem (see above), since it resolves a real, separate self-contradictory `NSWindowCollectionBehavior` state against the `setVisibleOnAllWorkspaces({ visibleOnFullScreen: true })` call, confirmed by reading Electron's own native macOS source.

### 6.7 Custom Mascot Generation (Opt-In)

On top of the default mascot (§6.6), users can generate their own: upload a photo of anything reasonable (themselves, a pet, a drawing), and it's converted via OpenAI's image model into a matching pixel-art sprite set — one image per nudge stage — that then drives the same mascot window, no changes to the nudge state machine itself. One-time setup, not part of the per-session core loop. Strictly opt-in — the app is fully functional out of the box with the bundled default mascot and no OpenAI key configured.

Full design — prompt strategy, cross-image consistency approach, model choice and reasoning, IPC shapes: `docs/mascot-generation.md`.

## 7. Data Model (SQLite, local only)

```
sessions
  id, started_at, ended_at, declared_task, distraction_list (json), approved_list (json),
  on_task_seconds, distracted_seconds, ambiguous_seconds, category_breakdown (json)
  summary_text, next_steps (json)  -- legacy only: populated on sessions ended before the
                                    -- stats-based summary (§6.5); null/unused on new ones

classification_events
  id, session_id, timestamp, signal_type (native|browser|vision),
  raw_signal (json), classification (on_task|distraction|drift|ambiguous),
  reasoning (nullable, populated on vision escalation)

distraction_intervals
  id, session_id, started_at, ended_at, max_stage_reached
```

## 8. Privacy & Permissions

- First launch: explicit OS permission prompts (macOS: Screen Recording, Accessibility) — must be a designed onboarding step, not an afterthought, since the OS will block screenshot/window-title access until granted.
- Visible on/off toggle for monitoring at all times; a paused state the user fully controls.
- Screenshots are taken of the **active window only**, never full-desktop, and are not persisted after a classification call resolves (only the textual classification result + reasoning is stored, not the image).
- Data sent to the vision API is limited to: window titles, tab URLs/titles, and — only on vision escalation — a single active-window screenshot. No raw keystroke or full-screen data ever leaves the device.

## 9. Deferred / v2+ Ideas (explicitly out of scope now)

- On-device/local model option for classification (privacy + cost), once the local boundary in the architecture (§5) is already designed to support swapping the classification backend.
- Other browsers (Firefox, Safari, Arc).
- Override/snooze button on nudges — revisited 2026-07-08 (see §6.4) and reaffirmed as not wanted, even after escalation timing sped up considerably. Not fully closed (a v1.1 patch is still the documented escape hatch if real usage changes the calculus), but it's been actively reconsidered once, not just sitting untouched.
- ~~Historical analytics across multiple sessions (trends, weekly views).~~ Implemented — see §6.5 (`session:getTrends`, a rolling last-7-days summary shown atop the past-sessions list).
- Mobile companion / remote session viewing.

## 10. Open Risks to Watch During Build

- False-positive rate on drift detection without an override — primary thing to monitor once using it daily. Gets more important, not less, now that escalation is faster (§6.3/§6.4).
- OpenAI API cost per session if ambiguous cases (e.g. unrecognized apps) are more common than expected. Each vision/image call still logs its own model and latency to the console per-call (`vision-client.ts`, `openai-image-client.ts`), but a per-session cost rollup in the UI was explicitly decided against — not worth building for a single-user local tool.
- ~~Extension ↔ Electron WebSocket reliability (reconnect logic if the Electron app restarts while the browser stays open).~~ Investigated 2026-07-08: the extension's own reconnect logic (retry every 5s) was already correct. The real bug was upstream — `ws-server.ts` kept serving a stale cached tab signal after a disconnect, which fed vision escalation a window title that no longer matched anything by the time it tried to screenshot, silently masquerading as a Screen Recording permission problem. Fixed (cache clears on disconnect); full writeup in `.codex/skills/activity-classification/SKILL.md`.
