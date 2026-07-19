# Mascot Generation — Custom Pixel-Art Companion

**Status:** implemented
**Owner:** Alex
**Last updated:** 2026-07-04

---

## 1. Overview

Extends the mascot companion (PRD §6.3/§6.6) with a one-time setup flow: the user
uploads a photo of anything reasonable (themselves, a pet, a drawing) and it's
converted into a small pixel-art sprite set — one image per nudge stage
(calm / gentle / upset / breakdown) — that then drives the existing always-on-top
mascot window exactly as hand-authored art would have.

This is additive to the core loop. Session monitoring, classification, and
the nudge state machine do not change; task-specific nudge copy is generated
separately at the start of each session and does not depend on the mascot's
appearance.

## 2. Why Pixel Art

Full-detail, photorealistic-style generation makes cross-image consistency hard:
more surface area (lighting, proportions, fine detail) for the model to drift on
between the 4 separate generations. Committing to a **retro NES/SNES-style pixel
sprite** at a small, fixed resolution shrinks that surface area a lot — fewer
pixels, a locked palette, hard edges, no anti-aliasing — which makes "all 4
states look like the same character, same size, same proportions" tractable
instead of a prompt-engineering guessing game. It also happens to fit the
product's tone well.

Default target: **64×64px canvas**, transparent background, a palette capped at
~16–32 colors. These are starting numbers to tune once the first few generations
are actually seen, not a hard spec.

## 3. Setup Flow (One-Time, Not Per-Session)

Reachable at first launch (alongside the permissions onboarding in PRD §8) and
later from a "Customize Mascot" settings entry.

1. **Select photo** — renderer calls `mascot:selectPhoto`; main opens a native
   file dialog, reads the file (renderer never touches `fs` directly, per
   `.codex`'s architecture rule), returns a preview to the renderer. The
   source photo is held in main only, never persisted.
2. **Generate base sprite** — renderer calls `mascot:generateBase`. Main sends
   the photo to OpenAI's image model (`gpt-image-2`) with the fixed prompt
   template (§4), gets back a calm/neutral pixel sprite, runs it through the
   deterministic post-process pass (§5), and returns the result. This becomes
   the **stage-0 reference image** every later generation is chained from.
3. **Review checkpoint** — user accepts, regenerates (new roll, same photo),
   or picks a different photo. Generation is nondeterministic, so this gate
   matters regardless of API cost.
4. **Generate the 3 stage variants** — once the base is approved, main makes 3
   more calls, each passing the **approved base sprite plus any other
   already-approved stage sprites** back in as character reference images
   (not the original photo), with a stage-specific emotion prompt.
   OpenAI's image-edit API accepts multiple reference images per call — using
   every previously-approved sprite as a reference, not just the base alone,
   reinforces consistency further than chaining off a single image would. By
   the time stage 3 generates: references = [base, gentle, upset].
5. **Final review grid** — all 4 states shown together. Any single stage that
   drifted can be regenerated on its own without redoing the set.
6. **Save** — main writes the 4 sprites to disk and records minimal metadata
   (§6). This intentionally persists — it's a user-owned generated asset, not
   a surveillance screenshot, so it doesn't conflict with the "screenshots are
   never persisted" rule.

## 4. Prompt Template Strategy

One fixed template, emotion is the only slot that changes per stage. The
templates below match what's actually in `app/src/main/openai-image-client.ts`
(`buildBasePrompt`/`buildStagePrompt`) — kept in sync here rather than left
as an earlier paraphrase, per this repo's rule of updating docs in the same
commit as the code that needs them.

**Base generation (stage 0), from the source photo:**

```
Convert the subject(s) in this photo into a retro 16-bit-style pixel art game
sprite, {CANVAS_SIZE}px canvas, limited palette (~{PALETTE_SIZE} colors),
hard pixel edges, no anti-aliasing or gradients. The background must be a
single, completely flat, solid magenta color (hex #FF00FF), with a clean
hard edge against the character — no gradient, no drop shadow, no checkered
pattern, no texture of any kind in the background. This exact magenta will
be removed and replaced with transparency afterward, so any variation in it
will show up as a visible defect.
If the photo shows more than one subject (e.g. a person and a pet), include
all of them together in one combined sprite, not just one of them picked at
random — later expression variants need every subject present so they can
all change expression together, in unison.
If the subject is not a human being (an animal, an object, a drawing, etc.),
still give it simple, clearly readable humanlike facial features — eyes and
a mouth capable of showing emotion — so it can visibly express calm, worry,
upset, and distress in later variants. Keep whatever makes the subject
recognizable (shape, color, markings, texture), but it must have a face.
The sprite must be fully rendered within the frame: every part of the
subject that's supposed to be visible needs to be completely filled in and
colored, with no unfinished, cut-off, or partially-colored regions — treat
an incomplete sprite as a failed generation, not an acceptable stylistic
choice.
Front-facing, centered in frame, full character visible with consistent
margin on all sides. Calm, neutral, content expression. This will be the
reference sprite for a set of matching expression variants — keep the
design simple enough to redraw with only the face/pose changing.
```

**Stage variants (1–3), from the approved base sprite plus any other
already-approved stages, all passed as character reference images:**

```
Using the attached sprite(s) as exact character references, generate a new
retro 16-bit-style pixel art sprite of the exact same character(s), in the
identical style, {CANVAS_SIZE}px canvas, same limited palette, same pose
framing. The background must stay a single, completely flat, solid magenta
color (hex #FF00FF) with a clean hard edge — no gradient, no texture, no
checkered pattern. Change only the facial expression and body language to
convey: {EMOTION_DESCRIPTION}. If the reference shows more than one subject,
apply this same expression change to every subject in the sprite equally —
they should all look like they're feeling it together, not just one of them.
The sprite must remain fully rendered: every part of the subject(s) that was
filled in in the reference must stay completely filled in and colored here
too, with no unfinished or partially-colored regions introduced by the
expression change.
Do not change proportions, outline weight, palette, camera framing, or the
character's identity.
```

| Stage          | `{EMOTION_DESCRIPTION}`                         |
| -------------- | ----------------------------------------------- |
| 1 — Gentle     | mildly concerned, perked up, noticing something |
| 2 — Noticeable | visibly upset, agitated                         |
| 3 — Direct     | breaking down — crying, falling apart           |

**Real-world edge cases these templates now mitigate** (found from actual use, in the same spirit as the empirically-confirmed chroma-key notes in §5 — these are prompt-level mitigations, not guaranteed fixes, since there's no automatic detection or retry if the model still gets it wrong):

- **Incomplete fills.** A generated sprite from a real photo of a person in a jersey came back with one shoulder/collar area as a patchy, unfinished-looking region instead of solid color, next to a cleanly-filled other sleeve. The prompt now explicitly states that partial/unfinished rendering is unacceptable.
- **Multiple subjects.** A photo with more than one subject (e.g. a person and a pet) previously had no guidance on keeping both, or on making stage variants change expression for all of them together rather than just one.
- **Non-human subjects.** A photo of something without a face (an object, etc.) had no guidance that the sprite still needs expressive eyes/mouth — required regardless of source content, since the mascot's whole job is emoting across all 4 stages.

## 5. Consistency Backstop: Deterministic Post-Processing

The API requests an explicit 1024×1024 image at low quality, which gets every
generation much closer to square/consistent than hoping the model picks
something reasonable on its own. That's not the same as a literal 64×64 pixel
grid though — "pixel art" is still a rendered _style_ at whatever resolution
is requested, not a literal small grid. So treat every generation as a
_high-res pixel-art-style image_ and enforce the real contract in code after
the API call returns:

1. Nearest-neighbor downsample to the exact target canvas (e.g. 64×64).
2. Chroma-key removal (see below) to produce real transparency.
3. Quantize to the fixed palette size.

This runs identically on all 4 generations, so "same size and proportions" is
guaranteed by code, not hoped for from the prompt.

**Transparency is chroma-keyed, not real alpha — confirmed empirically, not
assumed.** Asking the model for a "transparent background" doesn't produce a
real alpha channel: the raw output came back as flat JPEG (no alpha at all),
and the model represented "transparent" by literally drawing a checkerboard
pattern as pixel content — the visual convention for transparency, not the
real thing. Fix: the prompt asks for a solid, flat **magenta** background
(`#FF00FF`) instead — a deliberate choice, the same designated
"transparent" marker color real NES/SNES-era sprite formats used, for the
same reason (a color unlikely to occur naturally) — and post-processing
chroma-keys that exact color out to real alpha. This is a more reliable
target than hoping the model's own transparency support works: getting a
model to paint a flat, consistent solid color is a much easier ask than
getting real alpha channel output through this API path.

**The chroma-key match is hue-based, not distance-from-pure-magenta —
also confirmed empirically.** JPEG compression at fine silhouette edges
(curly hair especially) darkens the magenta without shifting its hue —
real captured fringe pixels like `rgb(149,0,151)` are unmistakably
magenta-hued (R and B both far above G, close to each other) but land
60–150 units away from `(255,0,255)` in plain Euclidean distance, which a
naive distance threshold misses. Checking hue (`r - g` and `b - g` both
past a threshold, `r` and `b` close to each other) instead of absolute
distance catches the compression-darkened case correctly.

## 6. Storage & Data Model

Multiple saved mascots, picked between via a library screen (`MascotLibrary.tsx`)
reachable from session setup — regenerating from scratch every session turned
out to be annoying enough in practice that this earned real support rather
than staying deferred (see §12's history). Still no SQLite table: the
collection is small, file-based, and doesn't need relational queries — just
"list directories, read each one's metadata.json":

```
userData/mascots/
  <mascotId>/
    calm.png, gentle.png, upset.png, breakdown.png
    metadata.json   → { createdAt: string }
  <mascotId2>/ ...
  selected.json     → { selectedMascotId: string | null }
```

`mascotId` reuses the same ID scheme as session IDs (`newId()` in `db.ts`).
`selected.json`'s `null` means "use the bundled default" — a real selectable
option in the library UI, not just an absence. Saving a newly-generated
mascot creates a new entry and selects it; deleting the currently-selected
one clears the selection back to the default rather than silently falling
onto a different saved mascot. All of this lives in `app/src/main/mascot-library.ts`,
kept separate from `mascot-setup.ts` (which stays scoped to the in-memory
generation-wizard state, not the persisted collection).

The original single-`active/`-directory layout migrates automatically and
once: on startup, if the old directory exists and `selected.json` doesn't
yet, it's moved into the new scheme under a fresh id, its real `generatedAt`
timestamp is carried over as `createdAt`, and it's selected — so an
already-generated mascot isn't orphaned by this change.

## 7. Integration with the Mascot Window / Nudge State Machine

No changes to `nudge:trigger` / `nudge:clear` or the stage state machine
(PRD §6.3, first-session-tasks.md step 12). The mascot window already swaps
its displayed asset based on stage; this just changes _where that asset comes
from_. Main exposes the 4 saved sprites to the renderer via `mascot:getActive`
(or a registered `mascot://` protocol) since the renderer can't read the
filesystem directly. Continuous idle motion within a stage (breathing, blink)
is a lightweight CSS transform on the static sprite, not something asked of
the generation pipeline.

## 8. New IPC Channels (proposed — finalize in `ipc-contract.md` when built)

### `mascot:selectPhoto`

Request: `{}`
Response: `{ photoPreviewDataUrl: string }`

### `mascot:generateBase`

Request: `{}` (acts on the photo selected in the prior call, held in main)
Response: `{ image: string /* data URL, post-processed */ }`

### `mascot:generateStage`

Request: `{ stage: 1 | 2 | 3 }`
Response: `{ image: string }`

### `mascot:save`

Request: `{}`
Response: `{ savedAt: string }`

### `mascot:getActive`

Request: `{}`
Response: `{ calm: string; gentle: string; upset: string; breakdown: string } | null`

## 9. Provider & API Key Handling

The image and vision clients are separate modules because they use different
OpenAI endpoints, but both use the same `OPENAI_API_KEY`. This keeps the
vision-classification and image-generation request shapes isolated without
requiring a second provider or key.

**Model: `gpt-image-2`.** The client uses its image-edit endpoint: the source
photo is the base-sprite reference, and every later stage supplies the earlier
sprites as reference images. Output is requested as a 1024×1024 PNG at low
quality before deterministic sprite post-processing.

Since this repo is public, anyone cloning it supplies their own OpenAI key:
an `OPENAI_API_KEY` entry in `.env` (gitignored, never committed, never a
shared default). No settings UI for entering it — this is a
personal/developer project distributed by cloning a repo, not a packaged app
for non-technical end users. `mascot:getKeyStatus` checks whether that env var
is set; if not, the "Customize mascot" screen shows an instruction to add it
and restart the app rather than offering an in-app form.

## 10. Fallback Default Mascot

A bundled default pixel-art sprite set ships with the app so it's fully
functional out of the box with no OpenAI key and no photo uploaded. Custom
mascot generation is strictly opt-in on top of that default, never a
requirement to run the app.

## 11. Error Handling / Edge Cases

- No OpenAI key configured → "Customize Mascot" entry point explains what's
  needed and links to where to add it; app keeps using the default mascot.
- Generation call fails (network/API error) → surface the error, offer retry.
- Model refuses (safety filter) → surface the refusal, let the user pick a
  different photo. No moderation logic on our side — content is assumed
  reasonable per the user's own judgment, per the original ask.

## 12. Open Questions / Deferred

- ~~Multiple saved mascot presets / switching between them — deferred until
  there's a reason beyond "would be nice."~~ Implemented — see §6.
- Whether 64×64 / ~16–32 colors are the right defaults — tune after seeing
  real output, not before.
- Any animation richer than static-sprite-per-stage (e.g. a 2-frame idle
  loop) — deferred; starts from the same base-sprite chaining approach in §3
  if pursued.
