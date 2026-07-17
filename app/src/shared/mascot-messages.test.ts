import { describe, expect, it, vi } from "vitest";
import {
  GENERIC_MASCOT_MESSAGE_PACK,
  pickMascotMessage,
  pickResetMessage,
} from "./mascot-messages";

describe("mascot messages", () => {
  it("renders the literal task and elapsed duration", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(
      pickMascotMessage(GENERIC_MASCOT_MESSAGE_PACK, 3, "write tests", 65),
    ).toContain("1 minute");
    expect(
      pickMascotMessage(GENERIC_MASCOT_MESSAGE_PACK, 3, "write tests", 65),
    ).toContain("write tests");
    vi.restoreAllMocks();
  });

  it("renders a task-specific reset", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickResetMessage(GENERIC_MASCOT_MESSAGE_PACK, "write tests")).toBe(
      "Back on: write tests.",
    );
    vi.restoreAllMocks();
  });
});
