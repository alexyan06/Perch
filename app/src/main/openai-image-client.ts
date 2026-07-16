import OpenAI, { toFile } from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey === undefined) {
    throw new Error("[openai-image-client] OPENAI_API_KEY is not set");
  }
  client = new OpenAI({ apiKey });
  return client;
}

const BASE_MODEL = "gpt-image-2";
const CANVAS_SIZE = 64;
const PALETTE_SIZE = 24;

function buildBasePrompt(): string {
  return `Convert the subject(s) in this photo into a retro 16-bit-style pixel art game
sprite, ${CANVAS_SIZE}px canvas, limited palette (~${PALETTE_SIZE} colors),
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
design simple enough to redraw with only the face/pose changing.`;
}

export interface GeneratedSprite {
  imageBase64: string;
  mimeType: string;
}

type ImageReference = { mimeType: string; data: string };

async function runImageEdit(
  logLabel: string,
  prompt: string,
  references: ImageReference[],
): Promise<GeneratedSprite> {
  const start = Date.now();
  const images = await Promise.all(
    references.map((reference, index) =>
      toFile(
        Buffer.from(reference.data, "base64"),
        `reference-${index}.png`,
        { type: reference.mimeType },
      ),
    ),
  );
  const response = await getClient().images.edit({
    model: BASE_MODEL,
    image: images,
    prompt,
    size: "1024x1024",
    quality: "low",
    output_format: "png",
  });

  console.log(`[openai-image-client] ${logLabel} call`, {
    model: BASE_MODEL,
    latencyMs: Date.now() - start,
  });

  const imageBase64 = response.data?.[0]?.b64_json;
  if (imageBase64 === undefined) {
    throw new Error(`[openai-image-client] no image returned from ${logLabel}`);
  }

  return { imageBase64, mimeType: "image/png" };
}

export async function generateBaseSprite(params: {
  photoBase64: string;
  mimeType: string;
}): Promise<GeneratedSprite> {
  return runImageEdit("generateBaseSprite", buildBasePrompt(), [
    { data: params.photoBase64, mimeType: params.mimeType },
  ]);
}

const EMOTION_DESCRIPTIONS: Record<1 | 2 | 3, string> = {
  1: "mildly concerned, perked up, noticing something",
  2: "visibly upset, agitated",
  3: "breaking down — crying, falling apart",
};

function buildStagePrompt(stage: 1 | 2 | 3): string {
  return `Using the attached sprite(s) as exact character references, generate a new
retro 16-bit-style pixel art sprite of the exact same character(s), in the
identical style, ${CANVAS_SIZE}px canvas, same limited palette, same pose
framing. The background must stay a single, completely flat, solid magenta
color (hex #FF00FF) with a clean hard edge — no gradient, no texture, no
checkered pattern. Change only the facial expression and body language to
convey: ${EMOTION_DESCRIPTIONS[stage]}. If the reference shows more than one
subject, apply this same expression change to every subject in the sprite
equally — they should all look like they're feeling it together, not just
one of them.
The sprite must remain fully rendered: every part of the subject(s) that was
filled in in the reference must stay completely filled in and colored here
too, with no unfinished or partially-colored regions introduced by the
expression change.
Do not change proportions, outline weight, palette, camera framing, or the
character's identity.`;
}

export async function generateStageVariant(params: {
  stage: 1 | 2 | 3;
  references: Array<{ base64: string; mimeType: string }>;
}): Promise<GeneratedSprite> {
  return runImageEdit(
    `generateStageVariant(${params.stage})`,
    buildStagePrompt(params.stage),
    params.references.map((reference) => ({
      data: reference.base64,
      mimeType: reference.mimeType,
    })),
  );
}
