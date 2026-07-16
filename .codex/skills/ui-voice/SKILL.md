---
name: ui-voice
description: Use alongside frontend-design for any UI copy or interaction tone in this app — nudge banners, notifications, summaries, empty states, error messages. Defines this specific product's voice so it doesn't read as generic or alarming.
---

# UI Voice - Perch

This is a tool that's supposed to feel like a calm coworker glancing over, not a scolding app or a gamified guilt machine. Every piece of copy and every interaction should be checked against that bar.

## Tone rules

Never moralize, never guilt. A nudge reports a fact and restates the user's own stated intent back to them - it does not editorialize about willpower, productivity, or worth.

The app reports state, the user decides what to do with it.

Active voice, plain verbs, sentence case.

Errors and failures are calm and specific, not apologetic and not vague.

Empty states are invitations, not dead ends.

## Specific copy patterns to reuse

- Session start prompt: "What are you working on?" (task field), "Anything you want to avoid? (optional)" (distraction list field)
- Nudge stage 1 (gentle): a short, neutral restatement - no exclamation points, no questions.
- Nudge stage 3 (direct): restates the literal task and elapsed time, per the IPC contract's `nudge:trigger` payload.
- End-of-session summary heading: "Here's how it went"

## What to avoid entirely

- Streaks, scores, gamification language
- Exclamation points anywhere in system-generated copy
- Referring to distraction as failure
- Any copy that assumes why the user got distracted

