import { describe, expect, it } from "vitest";
import { buildStagePrompt } from "./openai-image-client";
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
});
