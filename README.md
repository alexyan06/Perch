# Perch

A desktop app that watches your active work session, classifies what you're
actually doing against a task you declared at the start (on-task /
distraction / drift), and nudges you back on track through an always-on-top
mascot companion — draggable out of the way, snappable to a corner, or
generated from your own photo — whose expression _is_ the notification (see
[below](#the-mascot-companion)). At the end of a session you get a
locally-computed breakdown of on-task vs. distracted time and where the time
went, no AI call required for that part, plus a rolling trends view across
your last 7 days of sessions.

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
- **Past sessions** are saved locally, individually deletable, and a rolling
  last-7-days trends view — reusing the same charts as a single session's
  summary — sits above the list.

## The mascot companion

The mascot _is_ the notification system — there's no OS-level notification
anywhere in this app. A small, frameless, always-on-top window sits in a
corner of your screen for the whole session and reacts live to your focus
state: calm and idle while you're on-task, noticing and perking up as
distraction starts, escalating through visibly upset to a "breaking down"
state the longer it sustains — speaking through its own in-window speech
bubble at every stage, picked from a pool of pre-written lines so it doesn't
repeat itself. The instant you're back on task, it resets, no lingering
grudge.

- **Repositionable.** Drag the mascot itself to move it anywhere on screen,
  including onto a second monitor. The End session control stays beside it,
  moving to the inward side after each drop. Wherever you leave it is remembered and
  restored next session; if that spot ever ends up on a display that's no
  longer connected, it falls back to the default corner instead of opening
  somewhere unreachable.

- **Generate your own mascot from any photo — opt-in, not required.**
  Upload a photo of yourself, a pet, a drawing, honestly anything, and it's
  converted through OpenAI's image model into a matching retro pixel-art
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

   | Variable            | Required?            | Purpose                                                                                                                                                                                                                                                                      |
   | ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `OPENAI_API_KEY`    | Effectively required | Powers vision escalation (tier 3 classification) and the opt-in custom mascot photo-generation feature. Without it, the app still runs — ambiguous cases never resolve past "ambiguous" and the bundled default mascot is used. Get one at [platform.openai.com](https://platform.openai.com/api-keys). |
   | `WS_PORT`           | Not currently used   | Reserved for the local WebSocket port the app and extension talk over. The port is currently hardcoded to `8743` in both the app and extension — setting this has no effect yet.                                                                                             |

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

Everything is stored locally in SQLite under your OS's app data directory —
nothing about your sessions is sent anywhere except the specific text/image
payloads described above, sent directly to OpenAI's API using
your own key. There's no telemetry, no backend server, and no team/shared
features (see `docs/PRD.md` for the full non-goals list).
