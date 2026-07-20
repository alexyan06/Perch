import { describe, expect, it } from "vitest";
import { extractCategoryLabel } from "./session-metrics";

describe("category labels", () => {
  it("presents Electron activity as Perch", () => {
    expect(extractCategoryLabel({ appName: "Electron" })).toBe("Perch");
    expect(extractCategoryLabel({ appName: "electron" })).toBe("Perch");
  });

  it("keeps other native app names unchanged", () => {
    expect(extractCategoryLabel({ appName: "Figma" })).toBe("Figma");
  });
});
