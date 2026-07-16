import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey === undefined) {
    throw new Error("[vision-client] OPENAI_API_KEY is not set");
  }
  client = new OpenAI({ apiKey });
  return client;
}

export type VisionClassification = "on_task" | "distraction" | "drift";

export interface VisionClassifyResult {
  classification: VisionClassification;
  reasoning: string;
}

const VISION_MODEL = "gpt-5.6";

const SYSTEM_PROMPT =
  "You are classifying a single screenshot to determine whether someone is on-task, distracted, or drifting, relative to a task they declared at the start of a work session.";

function buildUserPrompt(task: string, distractionList: string[]): string {
  const distractions =
    distractionList.length > 0
      ? distractionList.join(", ")
      : "(none specified)";
  return `User's declared task: "${task}"
User's declared distraction list: ${distractions}

Classify the attached screenshot of their active window as exactly one of:
- "on_task" — clearly related to or supportive of the declared task
- "distraction" — matches the declared distraction list, or is unrelated leisure/entertainment content
- "drift" — not on the distraction list, but doesn't relate to the declared task either (e.g. unrelated work, unrelated browsing)

Keep the reasoning to one short sentence.`;
}

function isVisionClassification(value: unknown): value is VisionClassification {
  return value === "on_task" || value === "distraction" || value === "drift";
}

export async function classifyScreenshot(params: {
  sessionId: string;
  task: string;
  distractionList: string[];
  screenshotBase64: string;
}): Promise<VisionClassifyResult> {
  const start = Date.now();

  const response = await getClient().responses.create({
    model: VISION_MODEL,
    max_output_tokens: 200,
    input: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildUserPrompt(params.task, params.distractionList),
          },
          {
            type: "input_image",
            image_url: `data:image/png;base64,${params.screenshotBase64}`,
            detail: "low",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "vision_classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            classification: {
              type: "string",
              enum: ["on_task", "distraction", "drift"],
            },
            reasoning: { type: "string" },
          },
          required: ["classification", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  });

  console.log("[vision-client] vision call", {
    sessionId: params.sessionId,
    model: VISION_MODEL,
    latencyMs: Date.now() - start,
    usage: response.usage,
  });

  if (response.output_text.length === 0) {
    throw new Error("[vision-client] vision response had no output text");
  }

  const parsed: unknown = JSON.parse(response.output_text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("classification" in parsed) ||
    !("reasoning" in parsed) ||
    !isVisionClassification(
      (parsed as { classification: unknown }).classification,
    ) ||
    typeof (parsed as { reasoning: unknown }).reasoning !== "string"
  ) {
    throw new Error(
      `[vision-client] vision response did not match expected shape: ${response.output_text}`,
    );
  }

  const validated = parsed as {
    classification: VisionClassification;
    reasoning: string;
  };
  return {
    classification: validated.classification,
    reasoning: validated.reasoning,
  };
}
