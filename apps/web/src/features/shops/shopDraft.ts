import {
  bannerImageUrlKey,
  bannerPresetKey,
  bannerThemeKey,
  type BannerSource,
} from "./banner";
import { DEFAULT_BUILDER_CATEGORIES } from "./types";
import type { UiShop } from "@/services/mappers";

export type ShopDraft = {
  step: 0 | 1 | 2;
  name: string;
  currency: string;
  /** Work-email domain for public storefront signup, e.g. "acme.com" (no @). */
  companyEmailDomain: string;
  logoUrl: string;
  categories: string[];
  bannerTheme: string;
  bannerPreset: string;
  bannerImageUrl: string;
};

/** Hydrate the create/publish builder draft from an existing shop (e.g. duplicate). */
export function shopDraftFromShop(shop: UiShop): ShopDraft {
  const source: BannerSource = {
    bannerConfig: shop.bannerConfig,
    logoUrl: shop.logoUrl,
  };
  return {
    step: 1,
    name: shop.name,
    currency: shop.currency,
    companyEmailDomain: shop.companyEmailDomain || "",
    logoUrl: shop.logoUrl || "",
    categories: shop.categories.length ? shop.categories : DEFAULT_BUILDER_CATEGORIES,
    bannerTheme: bannerThemeKey(source),
    bannerPreset: bannerPresetKey(source),
    bannerImageUrl: bannerImageUrlKey(source),
  };
}

export const INITIAL_SHOP_DRAFT: ShopDraft = {
  step: 0,
  name: "",
  currency: "Points",
  companyEmailDomain: "",
  logoUrl: "",
  categories: DEFAULT_BUILDER_CATEGORIES,
  bannerTheme: "dark",
  bannerPreset: "solid-pattern",
  bannerImageUrl: "",
};

export type ShopDraftAction =
  | { type: "set"; patch: Partial<ShopDraft> }
  | { type: "toggleCategory"; category: string };

export function shopDraftReducer(state: ShopDraft, action: ShopDraftAction): ShopDraft {
  if (action.type === "toggleCategory") {
    const has = state.categories.includes(action.category);
    return {
      ...state,
      categories: has
        ? state.categories.filter((c) => c !== action.category)
        : [...state.categories, action.category],
    };
  }
  return { ...state, ...action.patch };
}
