import { describe, it, expect } from "vitest";
import { MERGE_HRIS_TOOLS, USER_MANAGEMENT_TOOLS, DISPLAY_TOOLS } from "./data";
import {
  MERGE_HRIS_INTEGRATIONS,
  isMergeHrisIntegration,
  isMergeDirectoryProvider,
} from "@/services/merge-api";

describe("Google Workspace directory catalog", () => {
  it("includes Google Workspace in Merge tools and User management", () => {
    const tile = MERGE_HRIS_TOOLS.find((t) => t.id === "google-workspace");
    expect(tile?.name).toBe("Google Workspace");
    expect(tile?.desc).toMatch(/org directory/i);
    expect(USER_MANAGEMENT_TOOLS.some((t) => t.id === "google-workspace")).toBe(true);
  });

  it("is not listed under Shelf Merch display tools", () => {
    expect(DISPLAY_TOOLS.some((t) => t.id === "google-workspace")).toBe(false);
  });

  it("is a Merge-connectable slug and directory provider", () => {
    expect(MERGE_HRIS_INTEGRATIONS).toContain("google-workspace");
    expect(isMergeHrisIntegration("google-workspace")).toBe(true);
    expect(isMergeDirectoryProvider("google-workspace")).toBe(true);
    expect(isMergeDirectoryProvider("gusto")).toBe(false);
  });
});
