import { describe, expect, it } from "vitest";
import { shortlistSummary, type CuratorItem } from "./curatorTypes";

// Keep reusable budget calculations independent of the removed curator UI.
const item: CuratorItem = { key: "product:one", id: "one", kind: "product", name: "Desk lamp", source: "shelfmerch", price: 1000, currency: "INR", availability: "In stock" };
const brief = { recipients: 10, budgetPerRecipient: 3000, currency: "INR" };
describe("reusable gifting totals", () => {
  it("compares verified prices with a matching-currency budget", () => {
    expect(shortlistSummary([item], brief)).toEqual({ totals: { INR: 1000 }, missing: 0, difference: 2000 });
  });
  it("marks missing prices as partial and avoids a misleading budget comparison", () => {
    expect(shortlistSummary([item, { ...item, key: "idea", price: null, currency: null }], brief)).toEqual({ totals: { INR: 1000 }, missing: 1, difference: null });
  });
  it("keeps currencies separate without inventing an exchange rate", () => {
    expect(shortlistSummary([item, { ...item, key: "usd", price: 20, currency: "USD" }], brief)).toEqual({ totals: { INR: 1000, USD: 20 }, missing: 0, difference: null });
  });
});
