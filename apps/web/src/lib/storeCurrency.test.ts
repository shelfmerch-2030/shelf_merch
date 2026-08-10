import { describe, it, expect } from "vitest";
import {
  conversionBadge,
  formatStoreCardPrice,
  formatUnitsFromInr,
  inrToCredits,
  inrToPoints,
  normalizeCurrencyMode,
  sendFlowTitle,
} from "@/lib/storeCurrency";

describe("storeCurrency", () => {
  it("converts INR to points and credits", () => {
    expect(inrToPoints(100)).toBe(200);
    expect(inrToCredits(100)).toBe(100);
  });

  it("formats store prices by mode", () => {
    expect(formatStoreCardPrice(499, "points")).toMatch(/998/);
    expect(formatStoreCardPrice(499, "points")).toMatch(/Pts/);
    expect(formatUnitsFromInr(250, "inr")).toMatch(/Credits/);
    expect(formatUnitsFromInr(250, "inr")).toMatch(/250/);
  });

  it("normalizes mode and labels send flow", () => {
    expect(normalizeCurrencyMode("inr")).toBe("inr");
    expect(normalizeCurrencyMode("points")).toBe("points");
    expect(normalizeCurrencyMode(undefined)).toBe("points");
    expect(sendFlowTitle("inr")).toBe("Send Credits");
    expect(conversionBadge("points")).toBe("₹1 = 2 Pts");
  });
});
