import { describe, expect, it } from "vitest";
import { curatedKitRequiresLogo } from "./curatedRequireLogo";

describe("curatedKitRequiresLogo", () => {
  it("returns false for non-curated / missing meta", () => {
    expect(curatedKitRequiresLogo(null)).toBe(false);
    expect(curatedKitRequiresLogo(undefined)).toBe(false);
    expect(curatedKitRequiresLogo({ curated: false })).toBe(false);
  });

  it("defaults to required when curated and no flag is set", () => {
    expect(curatedKitRequiresLogo({ curated: true })).toBe(true);
  });

  it("uses snapshotted designNotes.requireLogo", () => {
    expect(curatedKitRequiresLogo({ curated: true, requireLogo: false })).toBe(false);
    expect(curatedKitRequiresLogo({ curated: true, requireLogo: true })).toBe(true);
  });

  it("prefers live platform rules over snapshot", () => {
    expect(
      curatedKitRequiresLogo({ curated: true, requireLogo: true }, { requireLogo: false }),
    ).toBe(false);
    expect(
      curatedKitRequiresLogo({ curated: true, requireLogo: false }, { requireLogo: true }),
    ).toBe(true);
  });

  it("ignores platform rules object when requireLogo is absent", () => {
    expect(curatedKitRequiresLogo({ curated: true, requireLogo: false }, {})).toBe(false);
    expect(curatedKitRequiresLogo({ curated: true }, {})).toBe(true);
  });
});
