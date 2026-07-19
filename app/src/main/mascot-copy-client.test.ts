import { describe, expect, it } from "vitest";
import { parseSessionMessagePackResponse } from "./mascot-copy-client";

const validPack = {
  gentle: ["a", "b", "c", "d", "e"],
  upset: ["f", "g", "h", "i", "j"],
  breakdown: ["k", "l", "m", "n", "o"],
  reset: ["p", "q", "r", "s", "t"],
};

describe("session message-pack response", () => {
  it("accepts a completed five-message response", () => {
    expect(
      parseSessionMessagePackResponse({
        status: "completed",
        output_text: JSON.stringify(validPack),
      }),
    ).toEqual(validPack);
  });

  it("reports an incomplete response before parsing its empty body", () => {
    expect(() =>
      parseSessionMessagePackResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: "",
      }),
    ).toThrow("incomplete: max_output_tokens");
  });

  it("rejects empty, malformed, and invalid packs", () => {
    expect(() =>
      parseSessionMessagePackResponse({ status: "completed", output_text: "" }),
    ).toThrow("response was empty");
    expect(() =>
      parseSessionMessagePackResponse({
        status: "completed",
        output_text: "{",
      }),
    ).toThrow("not valid JSON");
    expect(() =>
      parseSessionMessagePackResponse({
        status: "completed",
        output_text: JSON.stringify({ ...validPack, gentle: validPack.gentle.slice(0, 4) }),
      }),
    ).toThrow("did not meet copy constraints");
    expect(() =>
      parseSessionMessagePackResponse({
        status: "completed",
        output_text: JSON.stringify({
          ...validPack,
          gentle: ["get back to it", ...validPack.gentle.slice(1)],
        }),
      }),
    ).toThrow("did not meet copy constraints");
  });
});
