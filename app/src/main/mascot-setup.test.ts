import { describe, expect, it } from "vitest";
import { buildStagePrompt, parseGeneratedSprite } from "./openai-image-client";
import { STAGE_ORDER } from "./mascot-setup";

describe("mascot hello asset", () => {
  it("includes hello after the four nudge assets", () => {
    expect(STAGE_ORDER).toEqual([
      "calm",
      "gentle",
      "upset",
      "breakdown",
      "hello",
    ]);
  });

  it("asks the generator for a clear friendly wave", () => {
    expect(buildStagePrompt(4)).toContain("clearly waving one hand");
    expect(buildStagePrompt(4)).toContain("same character");
  });

  it("uses the last image emitted by Gemini", () => {
    expect(
      parseGeneratedSprite({
        steps: [
          { content: [{ type: "image", data: "first", mime_type: "image/png" }] },
          { content: [{ type: "image", data: "last", mime_type: "image/jpeg" }] },
        ],
      }),
    ).toEqual({ imageBase64: "last", mimeType: "image/jpeg" });
  });
});
