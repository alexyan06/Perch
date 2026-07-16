# First Codex Session — Task Order

Work through these roughly in order. Use plan mode for every item marked (plan) — read the plan before approving execution. Run `npm run typecheck` (or the pnpm equivalent) after each item before moving to the next.

1. **(plan) Scaffold `app/` as a real electron-vite + React + TypeScript + Tailwind project**, replacing the placeholder `app/package.json` scripts with real ones. Keep the existing `src/main`, `src/renderer`, `src/preload` split — don't let the scaffolder flatten it.
2. **Wire up shadcn/ui** in the renderer (Tailwind config, component setup) — no components yet, just the working pipeline.
3. **(plan) Implement the typed IPC bridge** (`preload/index.ts`) covering every channel in `docs/ipc-contract.md` — stub the main-process handlers to return fake data for now, just get the renderer ↔ main wiring type-safe and working end to end.
4. **Add `better-sqlite3`**, create the schema from `docs/PRD.md` §7 (`sessions`, `classification_events`, `distraction_intervals`), confirm the main process can read/write it.
5. **(plan) Implement `active-win` + `powerMonitor` polling** in the main process, on a 5–10s tick, logging raw signals to console (not yet wired to classification) — confirm you're actually getting real window titles before building logic on top of it.
6. **Build the session-start UI** (task + distraction list inputs) wired to the real `session:start` IPC channel, writing a real row to `sessions`.
7. **(plan) Implement tier 1 (rule-based) classification** per `.codex/skills/activity-classification/SKILL.md` — no API calls yet, just the matching logic against the live polling signal from step 5.
8. **Scaffold `extension/`** as a Manifest V3 project using the existing `extension/src/manifest.json`, implement the WebSocket client per `docs/ipc-contract.md`, confirm it connects to a simple echo server in `app/` first before wiring real data.
9. **(plan) Wire the extension's real tab data into tier 1 classification**, replacing/supplementing the native-only signal from step 7.
10. **Add the approved-list input** to the session-start UI (alongside the existing distraction-list field) and thread `approvedList` through `session:start` (IPC contract already updated), the `sessions` table (`approved_list` column), and `classifyTier1` (check order: distraction list → approved list → task keywords → ambiguous) per `docs/PRD.md` §6.1/§6.2 and the updated `activity-classification` skill.
11. **(plan) Implement tier 2 (dwell timer) + tier 3 (vision escalation)**, including the vision client wrapper mentioned in `.codex`'s architecture rules — this is the first real external API cost, test it deliberately with a couple of manual ambiguous cases before trusting it in a live loop.
12. **(plan) Implement the nudge/mascot-stage state machine** in the main process per `docs/PRD.md` §6.3 — tracks distraction duration, computes stage 0–3, fires `nudge:trigger`/`nudge:clear` over IPC (already typed in `docs/ipc-contract.md`), and writes `distraction_intervals` rows on resolve. No UI yet — this step is the state machine only, verify stage transitions via logging before building the window that renders them.
13. **(plan) Build the mascot companion window** — a small always-on-top, frameless, transparent `BrowserWindow` pinned to a screen corner, replacing the current full-size `SessionActive` view per PRD §6.6. Pick an asset approach (sprite sheet vs. SVG vs. Lottie) and wire its state purely off `nudge:trigger`/`nudge:clear` from step 12 — calm/idle by default, escalating through stage 1–3 expressions (stage 3 art direction: crying/angry/falling-apart, exact look is a design call to make during this step).
14. **Add the in-mascot speech bubble for stages 2–3** (PRD §6.3) — no OS notifications anywhere in this app; stage 2/3 text renders inside the mascot window itself, sourced from the `nudge:trigger` payload's `task`/`distractedSinceSeconds` fields.
15. **(plan) Wire the summary generator into end-of-session summary generation** (PRD §6.5) — replace the current hardcoded placeholder in `session:end`, compute real `onTaskSeconds`/`distractedSeconds` from `classification_events`/`distraction_intervals`, return prose summary + 2–4 next steps.
16. **Build the past-sessions list UI**, wired to the already-existing `session:getPast` IPC channel.
17. Revisit this list once 10–16 are solid — anything further (onboarding/permissions flow per PRD §8, override UX per §6.4, multi-browser support) is out of scope until then.

Notes for whoever (you, future-you) is running this:

- Don't skip straight to step 11 because "that's the interesting part." Steps 1–10 are what make step 11 trustworthy instead of guesswork.
- Build the state machine (12) before the mascot window (13) — debugging stage-transition logic is much harder once it's tangled up with animation/rendering code.
- If Codex goes sideways twice on the same step, `/clear` and restart with a sharper prompt rather than patching a derailed session — see `.codex` workflow notes.
