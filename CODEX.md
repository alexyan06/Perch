# CODEX.md

Perch — desktop app that monitors active work sessions, classifies activity as on-task/distraction, and nudges the user back on track.

Full product spec: @docs/PRD.md
IPC & messaging contract (renderer/main/extension): @docs/ipc-contract.md
First-session task order: @docs/first-session-tasks.md
Codex workflow notes for this project: @docs/codex-code-workflow.md
Custom mascot photo-generation design (opt-in feature, PRD §6.7): @docs/mascot-generation.md

## Stack

- Electron + TypeScript (main process owns all OS access — no Rust, no native modules beyond what's listed below)
- React + Tailwind + shadcn/ui (renderer)
- `better-sqlite3` for local session storage (sync API, no separate DB server)
- `active-win` for active app/window detection, built-in `powerMonitor` for idle, built-in `desktopCapturer` for screenshots
- OpenAI API (`openai`) for vision classification/escalation and optional mascot image generation (end-of-session summaries are computed locally, no AI call — see `docs/PRD.md` §6.5)
- Chrome extension (Manifest V3) in `extension/`, talks to the Electron app over a local WebSocket — separate build, not bundled into the main app build

## Commands

- `npm run dev` — start Electron app in dev mode (hot reload renderer)
- `npm run build` — production build
- `npm run typecheck` — run before considering any task done
- `npm run lint` — eslint, do not hand-fix what this can fix automatically
- `npm test` — vitest, run scoped to the file(s) you changed, not the full suite, unless asked
- `cd extension && npm run build` — builds the Chrome extension separately

## Architecture rules

- **Main process = only place with OS/Node access.** Renderer (React) never touches `fs`, `active-win`, SQLite, or the vision SDK directly — always through an IPC bridge (`ipcMain`/`ipcRenderer`, exposed via a typed `preload.ts`). If you're about to import a Node-only package into a renderer file, stop — it belongs in main and should be exposed via IPC instead.
- **Screenshots are never persisted.** A screenshot exists only transiently to be sent to the vision call; only the resulting classification + reasoning text gets written to SQLite. Don't add code that writes screenshot files to disk as a side effect.
- **Classification has three tiers, in this order: rule-based match → ambiguous-dwell timer → vision escalation.** Don't skip straight to a vision API call for things `active-win` or the extension can already answer. Full logic, prompts, and guardrails: `.codex/skills/activity-classification/SKILL.md`.
- **All vision API calls go through a single client wrapper** (one module, not scattered `fetch`/SDK calls) so request/response shape, error handling, and cost logging stay in one place.

## Code style

- TypeScript strict mode, no `any` without a comment explaining why
- Functional React components only, hooks for state — no class components
- Prefer named exports over default exports
- IPC channel names are namespaced strings (`session:start`, `classification:tick`, not bare `start`)

## Workflow

- Always run `npm run typecheck` after a series of edits, before saying a task is done.
- Use plan mode for anything touching the classification pipeline, the nudge/escalation state machine, or the IPC boundary — these are the parts most likely to silently break in a way tests won't catch.
- For anything in `extension/`, treat it as a separate context — `/clear` before switching between main-app work and extension work, they rarely share relevant context.
- This file stays under ~150 lines. If you're adding a rule that's specific to one subsystem (classification logic, nudge timing, summary prompts) rather than true project-wide, it belongs in a skill under `.codex/skills/`, not here.
