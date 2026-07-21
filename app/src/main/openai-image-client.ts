const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const IMAGE_MODEL = "gemini-3-pro-image";
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

interface GeminiInteractionResponse {
  error?: { message?: string };
  steps?: Array<{
    content?: Array<{
      type?: string;
      data?: string;
      mime_type?: string;
    }>;
  }>;
}

export function parseGeneratedSprite(
  response: GeminiInteractionResponse,
): GeneratedSprite {
  const images = response.steps
    ?.flatMap((step) => step.content ?? [])
    .filter(
      (content): content is { type: "image"; data: string; mime_type?: string } =>
        content.type === "image" &&
        typeof content.data === "string" &&
        content.data.length > 0,
    );
  const image = images?.at(-1);
  if (image === undefined) {
    throw new Error("[gemini-image-client] response did not contain an image");
  }
  return { imageBase64: image.data, mimeType: image.mime_type ?? "image/png" };
}

async function runImageEdit(
  logLabel: string,
  prompt: string,
  references: ImageReference[],
): Promise<GeneratedSprite> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error("[gemini-image-client] GEMINI_API_KEY is not set");
  }

  const start = Date.now();
  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      input: [
        { type: "text", text: prompt },
        ...references.map((reference) => ({
          type: "image",
          mime_type: reference.mimeType,
          data: reference.data,
        })),
      ],
      response_format: {
        type: "image",
        // Nano Banana Pro's Interactions endpoint currently supports JPEG
        // output only. postProcessSprite converts it to Perch's PNG assets.
        mime_type: "image/jpeg",
        aspect_ratio: "1:1",
        image_size: "1K",
      },
    }),
  });
  const body = (await response.json()) as GeminiInteractionResponse;
  if (!response.ok) {
    throw new Error(
      `[gemini-image-client] ${logLabel} failed: ${body.error?.message ?? response.statusText}`,
    );
  }

  console.log(`[gemini-image-client] ${logLabel} call`, {
    model: IMAGE_MODEL,
    latencyMs: Date.now() - start,
  });
  return parseGeneratedSprite(body);
}

export async function generateBaseSprite(params: {
  photoBase64: string;
  mimeType: string;
}): Promise<GeneratedSprite> {
  return runImageEdit("generateBaseSprite", buildBasePrompt(), [
    { data: params.photoBase64, mimeType: params.mimeType },
  ]);
}

const EMOTION_DESCRIPTIONS: Record<1 | 2 | 3 | 4, string> = {
  1: "mildly concerned, perked up, noticing something",
  2: "visibly upset, agitated",
  3: "breaking down — crying, falling apart",
  4: "a warm, friendly hello: smiling and clearly waving one hand toward the viewer",
};

export function buildStagePrompt(stage: 1 | 2 | 3 | 4): string {
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
  stage: 1 | 2 | 3 | 4;
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
