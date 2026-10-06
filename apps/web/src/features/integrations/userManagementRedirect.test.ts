import { describe, expect, it } from "vitest";
import { shouldOpenCampaignsAfterConnect } from "./userManagementRedirect";

describe("shouldOpenCampaignsAfterConnect", () => {
  it("is true for the user management HR platforms", () => {
    for (const id of [
      "workday",
      "bamboohr",
      "gusto",
      "keka",
      "deel",
      "ukg-pro",
      "hibob",
      "google-workspace",
      "zoho-people",
    ]) {
      expect(shouldOpenCampaignsAfterConnect(id)).toBe(true);
    }
  });

  it("is false for other integrations", () => {
    expect(shouldOpenCampaignsAfterConnect("slack")).toBe(false);
    expect(shouldOpenCampaignsAfterConnect("")).toBe(false);
  });
});
