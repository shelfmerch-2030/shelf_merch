import { describe, it, expect } from "vitest";
import {
  INITIAL_SHOP_DRAFT,
  shopDraftFromShop,
  shopDraftReducer,
} from "@/features/shops/shopDraft";
import { shopTabFromSearch } from "@/features/shops/types";
import type { UiShop } from "@/services/mappers";

const shop = {
  id: "s1",
  name: "Acme Store",
  currency: "INR",
  companyEmailDomain: "acme.com",
  logoUrl: "/uploads/logo.png",
  categories: ["Merch"],
  bannerConfig: { theme: "brand", preset: "exceptional-leader", imageUrl: "" },
} as UiShop;

describe("shopDraft", () => {
  it("hydrates a duplicate/edit draft from an existing shop", () => {
    const draft = shopDraftFromShop(shop);
    expect(draft.step).toBe(1);
    expect(draft.name).toBe("Acme Store");
    expect(draft.currency).toBe("INR");
    expect(draft.companyEmailDomain).toBe("acme.com");
    expect(draft.categories).toEqual(["Merch"]);
    expect(draft.bannerTheme).toBeTruthy();
  });

  it("patches fields and toggles categories", () => {
    let state = INITIAL_SHOP_DRAFT;
    state = shopDraftReducer(state, { type: "set", patch: { name: "New Shop", step: 1 } });
    expect(state.name).toBe("New Shop");
    expect(state.step).toBe(1);

    const category = state.categories[0];
    state = shopDraftReducer(state, { type: "toggleCategory", category });
    expect(state.categories.includes(category)).toBe(false);
    state = shopDraftReducer(state, { type: "toggleCategory", category });
    expect(state.categories.includes(category)).toBe(true);
  });
});

describe("shopTabFromSearch", () => {
  it("maps query tab values onto shop detail tabs", () => {
    expect(shopTabFromSearch("layout")).toBe("Layout");
    expect(shopTabFromSearch("shop_catalog")).toBe("Shop Catalog");
    expect(shopTabFromSearch("unknown")).toBeNull();
  });
});
