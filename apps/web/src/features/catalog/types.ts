import { productVariantSwatches } from "@/lib/variantColors";
import type { UiProduct } from "@/services/mappers";

/** Category tabs, matching the legacy catalog filter rail. */
export const CATALOG_CATEGORIES = [
  "All Products",
  "Apparel",
  "Accessories",
  "Bags",
  "Drinkware",
  "Technology",
  "Office Supplies",
  // "Health & Wellness",
  "Key Chains",
  "Card Holders"
] as const;

export const ALL_PRODUCTS = "All Products";

const CATEGORY_ALIASES: Record<string, (typeof CATALOG_CATEGORIES)[number]> = {
  apparel: "Apparel",
  accessories: "Accessories",
  bags: "Bags",
  "bags & travel": "Bags",
  "bags-travel": "Bags",
  drinkware: "Drinkware",
  technology: "Technology",
  "tech accessories": "Technology",
  "office supplies": "Office Supplies",
  "office-supplies": "Office Supplies",
  // "health & wellness": "Health & Wellness",
  "all products": "All Products",
  "key chains": "Key Chains",
  "card holders": "Card Holders"
};

/** Map a landing/query category string onto a catalog tab. */
export function resolveCatalogCategory(raw: string | null | undefined): string {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return ALL_PRODUCTS;
  const exact = CATALOG_CATEGORIES.find((c) => c.toLowerCase() === key);
  if (exact) return exact;
  return CATEGORY_ALIASES[key] ?? ALL_PRODUCTS;
}

/** Stable URL slug for a catalog category page. */
export function catalogCategorySlug(category: string): string {
  return String(category || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parse a "Label: value" newline block into rows (key features / size guide). */
export function detailRows(value: string | undefined): [string, string][] {
  return String(value || "")
    .split("\n")
    .map((line): [string, string] => {
      const split = line.indexOf(":");
      return split > 0
        ? [line.slice(0, split).trim(), line.slice(split + 1).trim()]
        : [line.trim(), ""];
    })
    .filter(([label, val]) => label || val);
}

/** Catalog product display id (last 8 of the id, or a padded index fallback). */
export function productUniqueId(p: UiProduct, index: number): string {
  return p.id ? String(p.id).slice(-8).toUpperCase() : String(index + 1).padStart(8, "0");
}

/** Resolve display swatches: color name → hex (falls back to the name itself). */
export function productSwatches(p: UiProduct): { name: string; hex: string }[] {
  return productVariantSwatches(p);
}
