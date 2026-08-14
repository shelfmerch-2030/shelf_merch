import { describe, it, expect } from "vitest";
import { MERGE_HRIS_TOOLS, USER_MANAGEMENT_TOOLS } from "./data";
import { MERGE_HRIS_INTEGRATIONS, isMergeHrisIntegration } from "@/services/merge-api";

describe("Gusto HRIS catalog restore", () => {
  it("includes Gusto in Merge HRIS tools alongside other providers", () => {
    const ids = MERGE_HRIS_TOOLS.map((t) => t.id);
    expect(ids).toEqual([
      "workday",
      "bamboohr",
      "gusto",
      "keka",
      "deel",
      "ukg-pro",
      "hibob",
    ]);
  });

  it("shows Gusto in User management catalog without Requires setup", () => {
    const gusto = USER_MANAGEMENT_TOOLS.find((t) => t.id === "gusto");
    expect(gusto).toBeTruthy();
    expect(gusto?.name).toBe("Gusto");
    expect(gusto?.requiresSetup).toBeFalsy();
    expect(gusto?.icon).toBeTruthy();
  });

  it("treats gusto as a Merge HRIS integration slug", () => {
    expect(MERGE_HRIS_INTEGRATIONS).toContain("gusto");
    expect(isMergeHrisIntegration("gusto")).toBe(true);
  });

  it("does not regress other Merge providers", () => {
    for (const slug of ["workday", "bamboohr", "keka", "deel", "ukg-pro", "hibob"] as const) {
      expect(isMergeHrisIntegration(slug)).toBe(true);
      expect(MERGE_HRIS_TOOLS.some((t) => t.id === slug)).toBe(true);
    }
  });
});
