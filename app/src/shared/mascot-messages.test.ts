import { describe, expect, it } from "vitest";
import {
  createMascotMessagePicker,
  createMascotFallbackMessagePack,
  FALLBACK_MASCOT_MESSAGE_PACK,
} from "./mascot-messages";

describe("mascot messages", () => {
  it("renders the literal task and elapsed duration", () => {
    const picker = createMascotMessagePicker(
      FALLBACK_MASCOT_MESSAGE_PACK,
      () => 0,
    );
    expect(
      picker.pickNudge(3, "write tests", 65),
    ).toContain("1 minute");
    expect(
      picker.pickNudge(3, "write tests", 65),
    ).toContain("write tests");
  });

  it("uses a direct no-duration line for a rapid relapse", () => {
    const picker = createMascotMessagePicker(
      FALLBACK_MASCOT_MESSAGE_PACK,
      () => 0,
    );
    const message = picker.pickNudge(3, "play chess", 0, "rapid_relapse");
    expect(message).toContain("play chess");
    expect(message).not.toContain("0 seconds");
  });

  it("rotates through every message before repeating", () => {
    const pack = createMascotFallbackMessagePack();
    const picker = createMascotMessagePicker(pack, () => 0);
    const messages = new Set(
      Array.from({ length: pack.gentle.length }, () =>
        picker.pickNudge(1, "write tests", 0),
      ),
    );
    expect(messages).toHaveLength(pack.gentle.length);
    expect(picker.pickNudge(1, "write tests", 0)).toBeDefined();
  });

  it("keeps reset rotation independent from distraction stages", () => {
    const pack = createMascotFallbackMessagePack();
    const picker = createMascotMessagePicker(pack, () => 0);
    picker.pickNudge(1, "write tests", 0);
    const resets = new Set(
      Array.from({ length: pack.reset.length }, () =>
        picker.pickReset("write tests"),
      ),
    );
    expect(resets).toHaveLength(pack.reset.length);
  });
});
