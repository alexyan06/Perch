import { describe, expect, it } from "vitest";
import { classifyTier1 } from "./classifier";

const context = {
  task: "write the Perch demo video",
  distractionList: ["youtube", "perch"],
  approvedList: [],
};

describe("classifyTier1", () => {
  it("matches a declared distraction before other work context", () => {
    expect(
      classifyTier1(
        { appName: "Google Chrome", windowTitle: "YouTube" },
        context,
      ),
    ).toBe("distraction");
  });

  it("leaves an identifiable unrelated app ambiguous", () => {
    expect(
      classifyTier1({ appName: "Figma", windowTitle: "Untitled" }, context),
    ).toBe("ambiguous");
  });
});
