import OpenAI from "openai";
import type { MascotMessagePack } from "../shared/mascot-messages";

const COPY_MODEL = "gpt-5-mini";
const MESSAGE_COUNT_PER_STAGE = 5;
const STATE_COPY_PATTERN =
  /\b(off task|on task|get back|return|resume|refocus|distract)\b/i;
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
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === MESSAGE_COUNT_PER_STAGE &&
    value.every(
      (line) =>
        isShortLine(line) &&
        !line.includes("{task}") &&
        !line.includes("{duration}") &&
        !STATE_COPY_PATTERN.test(line),
    ) &&
    new Set(value.map((line) => line.trim().toLocaleLowerCase())).size === value.length
  );
}

interface SessionMessagePackResponse {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output_text: string;
}

export function parseSessionMessagePackResponse(
  response: SessionMessagePackResponse,
): MascotMessagePack {
  if (response.status !== "completed") {
    const reason = response.incomplete_details?.reason;
    throw new Error(
      `[mascot-copy] message pack response was ${response.status}${reason === undefined ? "" : `: ${reason}`}`,
    );
  }
  if (response.output_text.trim().length === 0) {
    throw new Error("[mascot-copy] message pack response was empty");
  }
  try {
    return parseMessagePack(JSON.parse(response.output_text));
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error("[mascot-copy] message pack response was not valid JSON");
    }
    throw err;
  }
}

function parseMessagePack(value: unknown): MascotMessagePack {
  if (typeof value !== "object" || value === null) {
    throw new Error("[mascot-copy] message pack was not an object");
  }
  const pack = value as Record<string, unknown>;
  if (
    !isTemplatePool(pack["gentle"]) ||
    !isTemplatePool(pack["upset"]) ||
    !isTemplatePool(pack["breakdown"]) ||
    !isTemplatePool(pack["reset"])
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

export async function generateSessionMessagePack(
  task: string,
): Promise<MascotMessagePack> {
  const response = await getClient().responses.create({
    model: COPY_MODEL,
    reasoning: { effort: "minimal" },
    max_output_tokens: 1600,
    input: `Write optional, short ending fragments for focus nudges about: ${task}\n\nThe app itself adds the on-task or off-task statement and the user's task. Your fragments only add light variety after that core message. Return exactly five distinct fragments in each pool: gentle, upset, breakdown, and reset. Do not mention whether the user is on task or off task. Do not tell them to get back, return, resume, refocus, or avoid distractions. Do not use {task}, {duration}, or the exact task text.\n\nFor chess, a quiet detail such as "The board is still set" is acceptable, but task flavor is optional and must never become instruction or coaching. Keep each fragment under 70 characters. No exclamation marks, questions, insults, swearing, shame, guilt, moralizing, scores, streaks, or assumptions about why the user switched tasks.`,
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
  return parseSessionMessagePackResponse(response);
}
