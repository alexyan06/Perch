import OpenAI from "openai";
import type { MascotMessagePack } from "../shared/mascot-messages";
import type { MascotVoiceProfile } from "./mascot-library";

const COPY_MODEL = "gpt-5-mini";
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client !== null) return client;
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey === undefined) throw new Error("[mascot-copy] OPENAI_API_KEY is not set");
  client = new OpenAI({ apiKey });
  return client;
}

function isShortLine(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 120 &&
    !value.includes("!")
  );
}

function isTemplatePool(
  value: unknown,
  requiredTokens: string[],
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 4 &&
    value.length <= 8 &&
    value.every(
      (line) =>
        isShortLine(line) && requiredTokens.every((token) => line.includes(token)),
    )
  );
}

function parseMessagePack(value: unknown): MascotMessagePack {
  if (typeof value !== "object" || value === null) {
    throw new Error("[mascot-copy] message pack was not an object");
  }
  const pack = value as Record<string, unknown>;
  if (
    !isTemplatePool(pack["gentle"], ["{task}"]) ||
    !isTemplatePool(pack["upset"], ["{task}"]) ||
    !isTemplatePool(pack["breakdown"], ["{task}", "{duration}"]) ||
    !isTemplatePool(pack["reset"], ["{task}"])
  ) {
    throw new Error("[mascot-copy] message pack did not meet copy constraints");
  }
  return {
    gentle: pack["gentle"],
    upset: pack["upset"],
    breakdown: pack["breakdown"],
    reset: pack["reset"],
  };
}

export async function generateMascotVoiceProfile(
  calmSpriteDataUrl: string,
): Promise<MascotVoiceProfile> {
  const response = await getClient().responses.create({
    model: COPY_MODEL,
    max_output_tokens: 180,
    input: [
      {
        role: "system",
        content:
          "Describe the visible mascot for gentle, non-humanizing copy style. Do not infer identity, biography, or sensitive traits from the image.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Return a short visual description and exactly three restrained voice traits for this pixel-art mascot.",
          },
          { type: "input_image", image_url: calmSpriteDataUrl, detail: "low" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "mascot_voice_profile",
        strict: true,
        schema: {
          type: "object",
          properties: {
            visualDescription: { type: "string" },
            voiceTraits: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["visualDescription", "voiceTraits"],
          additionalProperties: false,
        },
      },
    },
  });
  const parsed: unknown = JSON.parse(response.output_text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !isShortLine((parsed as { visualDescription?: unknown }).visualDescription) ||
    !Array.isArray((parsed as { voiceTraits?: unknown }).voiceTraits) ||
    (parsed as { voiceTraits: unknown[] }).voiceTraits.length !== 3 ||
    !(parsed as { voiceTraits: unknown[] }).voiceTraits.every(isShortLine)
  ) {
    throw new Error("[mascot-copy] voice profile did not meet constraints");
  }
  return {
    visualDescription: (parsed as { visualDescription: string }).visualDescription,
    voiceTraits: (parsed as { voiceTraits: string[] }).voiceTraits,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateSessionMessagePack(
  profile: MascotVoiceProfile,
  task: string,
): Promise<MascotMessagePack> {
  const response = await getClient().responses.create({
    model: COPY_MODEL,
    max_output_tokens: 700,
    input: `Write a message pack for a focus mascot.\nMascot: ${profile.visualDescription}\nVoice traits: ${profile.voiceTraits.join(", ")}\nTask: ${task}\n\nReturn 4-8 short lines in each pool. Use the exact placeholders {task} and {duration}; do not replace them. Every gentle, upset, and reset line must include {task}. Every breakdown line must include both {task} and {duration}. Keep a calm coworker tone: no exclamation marks, guilt, moralizing, scores, or assumptions about why the person switched tasks. Gentle lines are declarative, not questions.`,
    text: {
      format: {
        type: "json_schema",
        name: "mascot_message_pack",
        strict: true,
        schema: {
          type: "object",
          properties: {
            gentle: { type: "array", items: { type: "string" } },
            upset: { type: "array", items: { type: "string" } },
            breakdown: { type: "array", items: { type: "string" } },
            reset: { type: "array", items: { type: "string" } },
          },
          required: ["gentle", "upset", "breakdown", "reset"],
          additionalProperties: false,
        },
      },
    },
  });
  return parseMessagePack(JSON.parse(response.output_text));
}
