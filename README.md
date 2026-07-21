# Perch

A desktop focus companion. Start a session with the thing you mean to work
on, and Perch compares your active activity with that task (on-task /
distraction / drift). An always-on-top mascot responds in real time with a
clear, state-first nudge: stay on task, or get back to it. The mascot can be
moved out of the way, snapped to a corner, or generated from your own photo.

When a session ends, Perch shows a locally computed breakdown of on-task vs.
distracted time and where the time went—no AI call is needed for the summary—
plus a rolling seven-day trends view.

Full product spec: [`docs/PRD.md`](docs/PRD.md).

## How it works, briefly

- **Electron main process** has the only OS access: active-window polling
  (`active-win`), idle detection (`powerMonitor`), screenshots
  (`desktopCapturer`, active window only, never saved to disk), and local
  SQLite storage (`better-sqlite3`).
- **Classification is tiered** to keep AI cost down: rule-based keyword/list
  matching first, then a short dwell timer for genuinely ambiguous signals,
  and only then a vision call on a screenshot. Most ticks never reach the
  API.
- **Chrome extension** (Manifest V3) reports the active tab's URL/title to
  the Electron app over a local WebSocket, since a browser tab's real content
  is invisible to OS-level window polling alone.
- **Nudge wording is state-first and varied.** At the start of a session,
  Perch makes one small text request for several task-aware ending fragments
  for each nudge state. The app always supplies the core message itself—for
  example, that you're off task and should get back to the declared task—then
  rotates the fragments without repeats. If that request fails or no API key
  is configured, a built-in message pack keeps nudges working.
- **Past sessions** are saved locally, individually deletable, and a rolling
  last-7-days trends view — reusing the same charts as a single session's
  summary — sits above the list.

## The mascot companion

The mascot _is_ the notification system — there's no OS-level notification
anywhere in this app. A small, frameless, always-on-top window sits in a
corner of your screen for the whole session and reacts live to your focus
state: calm and idle while you're on-task, noticing as distraction starts,
escalating through visibly upset to a "breaking down" state the longer it
sustains, then resetting the instant you're back on task. Its in-window
speech bubble stays focused on that job: acknowledge that you're on track or
directly tell you to return to the task. Task-specific references are only a
small bit of flavor, never a replacement for the focus cue.

- **Repositionable.** Drag the mascot itself to move it anywhere on screen,
  including onto a second monitor. The End session control stays beside it,
  moving to the inward side after each drop. Wherever you leave it is remembered and
  restored next session; if that spot ever ends up on a display that's no
  longer connected, it falls back to the default corner instead of opening
  somewhere unreachable.

- **Generate your own mascot from any photo — opt-in, not required.**
  Upload a photo of yourself, a pet, a drawing, honestly anything, and it's
  converted through Gemini's Nano Banana Pro image model into a matching retro pixel-art
  sprite set: one image for each nudge stage (calm / gentle / upset /
  breaking-down). A few things this pipeline specifically handles, learned
  from actually generating a lot of these:
  - **Style, not photorealism, on purpose.** A locked-palette, hard-edged
    16-bit-style sprite has far less surface area to drift on than a
    photorealistic render, which matters a lot when 4 separate generations
    need to visibly read as the same character.
  - **Cross-image consistency via chaining, not independent generations.**
    Each expression variant is generated using the previously-approved
    sprites as character references — not the original photo — so
    calm/gentle/upset/breakdown stay visually locked to each other.
  - **A deterministic post-processing pass backstops the model**, rather
    than trusting prompt instructions alone: every sprite gets resized to
    the exact same canvas, has its background chroma-keyed to real
    transparency, and is quantized to a consistent palette in code.
  - **Multi-subject photos and non-human subjects are handled explicitly** —
    a photo with more than one subject keeps all of them (and moves them
    together through the same expression change), and anything without a
    face to begin with (a pet, an object) still gets simple, readable eyes
    and a mouth so it can actually emote across all 4 stages.

- **Keep a library of them.** Save as many generated mascots as you want,
  switch between them before a session starts, delete the ones you don't
  like. The bundled default mascot is always available as its own selectable
  option too — this entire feature is opt-in on top of it, never required to
  run the app.

Full design writeup — prompt templates, the consistency approach in more
detail, model choice and reasoning, storage layout:
[`docs/mascot-generation.md`](docs/mascot-generation.md).

## Prerequisites

- **Node.js ≥ 20**
- **pnpm** — this repo is a pnpm workspace (`app/` + `extension/`). If you
  don't have pnpm, enable it via corepack: `corepack enable`
- **Native build tools**, needed because `better-sqlite3` compiles a native
  module on install:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio Build Tools (Desktop development with C++ workload)
  - Linux: `python3`, `make`, and a C++ compiler (`build-essential` on Debian/Ubuntu)
- **Google Chrome**, if you want the browser-tab signal (optional — the app
  still runs and classifies based on native window titles without it)

Developed and tested primarily on **macOS**. Screen Recording / Accessibility
permission handling (see below) is macOS-specific; other platforms always
report those permissions as granted and haven't been verified end-to-end.

## Setup

1. **Clone and install:**

   ```
   git clone <this-repo-url>
   cd perch
   pnpm install
   ```

2. **Configure API keys** — copy the example env file and fill it in:

   ```
   cp .env.example .env
   ```

   | Variable            | Required? | Purpose |
   | ------------------- | --------- | ------- |
   | `OPENAI_API_KEY`    | Optional  | Enables vision escalation for ambiguous activity and one task-aware nudge-fragment pack per session. Without it, ambiguous activity remains ambiguous and Perch uses static nudge fragments. Get one at [platform.openai.com](https://platform.openai.com/api-keys). |
   | `GEMINI_API_KEY`    | Optional  | Enables opt-in custom mascot photo generation with Nano Banana Pro. Without it, the bundled mascot remains available. Get one at [Google AI Studio](https://aistudio.google.com/app/apikey). |
   | `WS_PORT`           | Not currently used | Reserved for the local WebSocket port. The app and extension currently use hardcoded port `8743`, so setting this has no effect yet. |

   `.env` is gitignored — never commit it.

3. **Run the app in dev mode:**

   ```
   pnpm dev
   ```

4. **Grant macOS permissions** when prompted on first launch (Screen
   Recording and Accessibility). You can also open System Settings directly
   from the in-app onboarding screen. Screenshots are only ever taken of the
   active window, and only the classification result is stored — the image
   itself is never persisted.

5. **Build and load the Chrome extension** (optional, but needed for
   accurate classification of what's happening in-browser):

   ```
   pnpm --filter extension build
   ```

   Then in Chrome: go to `chrome://extensions`, enable **Developer mode**,
   click **Load unpacked**, and select `extension/dist`. It's not published
   to the Chrome Web Store, so this manual load step is needed every time you
   set it up on a new machine (the extension will keep auto-reconnecting to
   the local app in the background afterward).

## Commands

Run from the repo root unless noted:

| Command                | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `pnpm dev`             | Start the Electron app in dev mode (hot reload renderer) |
| `pnpm build`           | Production build of the app                              |
| `pnpm typecheck`       | Type-check both `app/` and `extension/`                  |
| `pnpm lint`            | Lint both packages                                       |
| `pnpm test`            | Run the app's test suite (vitest)                        |
| `pnpm build:extension` | Build the Chrome extension into `extension/dist`         |

## Data & privacy

Everything is stored locally in SQLite under your OS's app data directory.
There is no telemetry, backend server, or team/shared feature.

When `OPENAI_API_KEY` is configured, Perch sends the following directly to
OpenAI using your key:

- The declared task once at session start, to generate optional, short
  task-aware endings for the nudge message pools.
- A screenshot of the active window, the declared task, and the user's
  distraction list only after activity remains ambiguous long enough to
  reach vision escalation. Screenshots are never saved to disk.

When `GEMINI_API_KEY` is configured, Perch sends the photo supplied by the
user directly to Gemini only when they explicitly generate a custom mascot
from it.

Browser URL/title signals, session history, saved mascot sprites, and
session summaries stay local. See `docs/PRD.md` for the full non-goals list.
