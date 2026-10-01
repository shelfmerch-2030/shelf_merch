import { describe, expect, it } from "vitest";
import { USER_MANAGEMENT_TOOLS } from "./data";
import { getHrisMarketplaceProfile, isHrisMarketplaceTile } from "./hrisMarketplaceCopy";

describe("HRIS marketplace profiles", () => {
  it("gives every user-management platform a Slack-style detail profile", () => {
    expect(USER_MANAGEMENT_TOOLS.length).toBeGreaterThan(0);
    for (const tile of USER_MANAGEMENT_TOOLS) {
      expect(isHrisMarketplaceTile(tile.id)).toBe(true);
      const profile = getHrisMarketplaceProfile(tile.id);
      expect(profile).toBeTruthy();
      expect(profile?.about).toContain(tile.name);
      expect(profile?.websiteUrl.startsWith("https://")).toBe(true);
      expect(profile?.categories).toHaveLength(2);
      expect(profile?.overview.length).toBeGreaterThan(0);
      expect(profile?.highlights.length).toBeGreaterThan(0);
      expect(profile?.tagline.length).toBeGreaterThan(0);
    }
  });
});
