---
name: activity-classification
description: Use whenever implementing or modifying the classification pipeline — the logic that decides whether the user's current activity is on-task, a distraction, drift, or ambiguous. Covers the three-tier escalation order, dwell timers, and the exact prompts sent to the vision API for text and vision classification. Read this before touching anything in app/src/main related to classification, the ambiguity timer, or vision escalation.
---

# Activity Classification

Full product context: see `docs/PRD.md` §6.2. This skill covers the _implementation_ logic — tiers, timers, and prompts — so the reasoning doesn't have to be reverse-engineered from code later.

## The three tiers, strictly in order

Never skip a cheaper tier to reach for a more expensive one. The cost and latency difference between tier 1 and tier 3 is large; classification correctness depends on giving the cheap tiers a real chance first.

### Tier 1 — Rule-based match (instant, no API call)

Input: the cheap signal (`{ owner, title }` from `active-win`, or `{ url, tabTitle }` from the extension).

Logic, checked in this order:

1. If the signal matches anything in the user's `distractionList` (substring match on title, or domain match on url) -> classify `distraction`, stop here.
2. If the signal matches anything in the user's `approvedList` (same substring/domain match) -> classify `on_task`, stop here. This list exists to shrink the ambiguous middle ground that would otherwise fall through to tier 3.
3. If the signal's title/owner clearly contains terms from the declared `task` -> classify `on_task`, stop here.
4. Otherwise -> `ambiguous`, proceed to tier 2 (the dwell timer), do not call the API yet.

This tier must never make a network call. It's pure string matching against the session's `task`, `distractionList`, and `approvedList`, all already in memory.

### Tier 2 — Ambiguity dwell timer (no API call, just a timer)

An `ambiguous` classification doesn't immediately escalate. Track how long the _current_ signal has stayed ambiguous (i.e. the active window/tab hasn't changed and tier 1 still says ambiguous).

- If ambiguous for < 60 continuous seconds -> leave classification as `ambiguous` for this tick, re-check on the next tick. Do not escalate yet.
- If ambiguous for >= 60 continuous seconds -> escalate to tier 3.
- If the signal changes (new window/tab) before 60s, the dwell timer resets -> re-run tier 1 against the new signal.

### Tier 3 — Vision escalation (API call, the expensive path)

Only reached after tier 2's dwell threshold is hit, or right before a nudge stage 2/3 fires, as a confirmation check. Only the dwell-timer trigger is actually implemented (`escalation.ts`'s `createEscalationTracker`).

Known failure mode (fixed): stale cached browser signal. The dwell timer and the eventual screenshot-matching step both key off `ws-server.ts`'s `getLatestBrowserSignal()`.

1. Capture a screenshot of the active window only (`desktopCapturer`, scoped - never full desktop).
2. Send to the vision API with the vision prompt below.
3. Parse the response into one of: `on_task`, `distraction`, `drift`.
4. Discard the screenshot immediately after the call resolves - never write it to disk, never keep it in memory longer than the request needs.

## Prompt templates

### Vision classification prompt

```
System: You are classifying a single screenshot to determine whether someone is on-task, distracted, or drifting, relative to a task they declared at the start of a work session.

User's declared task: "{task}"
User's declared distraction list: {distractionList.join(", ") || "(none specified)"}

Classify the attached screenshot of their active window as exactly one of:
- "on_task" — clearly related to or supportive of the declared task
- "distraction" — matches the declared distraction list, or is unrelated leisure/entertainment content
- "drift" — not on the distraction list, but doesn't relate to the declared task either (e.g. unrelated work, unrelated browsing)

Respond with strict JSON only, no prose:
{ "classification": "on_task" | "distraction" | "drift", "reasoning": "<one short sentence>" }
```

Notes:

- Keep `reasoning` short.
- If the API call fails or times out, fall back to `ambiguous` for that tick.
