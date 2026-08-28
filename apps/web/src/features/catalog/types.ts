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
] as const;

export const ALL_PRODUCTS = "All Products";

/** Subcategories shown on each category browse page. */
export const CATALOG_SUBCATEGORIES: Record<string, readonly string[]> = {
  Apparel: ["T-Shirts", "Polo Shirts", "Hoodies & Sweatshirts", "Jackets", "Caps", "Others"],
  Accessories: ["Lanyards", "Key Chains", "Badges", "Travel Accessories", "Lifestyle Accessories", "Others"],
  Bags: ["Backpacks", "Tote Bags", "Laptop Bags", "Duffel Bags", "Messenger Bags", "Others"],
  Drinkware: ["Bottles", "Mugs", "Tumblers", "Flasks", "Sippers", "Others"],
  "Office Supplies": ["Notebooks", "Diaries", "Pens", "Desk Accessories", "Calendars", "Card Holders", "Others"],
  Technology: ["Power Banks", "Wireless Chargers", "Speakers", "Headphones", "USB Drives", "Others"],
};

/** Legacy subcategory URL slugs that resolve to a parent category + subcategory filter. */
const LEGACY_SUBCATEGORY_SLUGS: Record<string, { parent: string; subcategory: string }> = {
  keys: { parent: "Accessories", subcategory: "Key Chains" },
  "key-chains": { parent: "Accessories", subcategory: "Key Chains" },
  "key chains": { parent: "Accessories", subcategory: "Key Chains" },
  cardholders: { parent: "Office Supplies", subcategory: "Card Holders" },
  "card-holders": { parent: "Office Supplies", subcategory: "Card Holders" },
  "card holders": { parent: "Office Supplies", subcategory: "Card Holders" },
};

const CATEGORY_ALIASES: Record<string, (typeof CATALOG_CATEGORIES)[number]> = {
  apparel: "Apparel",
  accessories: "Accessories",
  bags: "Bags",
  "bags & travel": "Bags",
  "bags-travel": "Bags",
  drinkware: "Drinkware",
  technology: "Technology",
  office: "Office Supplies",
  "office-supplies": "Office Supplies",
  all: "All Products",
  // Legacy / subcategory URLs → parent category pages
  keys: "Accessories",
  "key-chains": "Accessories",
  "key chains": "Accessories",
  cardholders: "Office Supplies",
  "card-holders": "Office Supplies",
  "card holders": "Office Supplies",
};

/** Stable URL slug for a catalog category page. */
export function catalogCategorySlug(category: string): string {
  return String(category || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Map a landing/query category string onto a catalog tab. */
export function resolveCatalogCategory(raw: string | null | undefined): string {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return ALL_PRODUCTS;
  const exact = CATALOG_CATEGORIES.find((c) => c.toLowerCase() === key);
  if (exact) return exact;
  const slug = catalogCategorySlug(key);
  const bySlug = CATALOG_CATEGORIES.find((c) => catalogCategorySlug(c) === slug);
  if (bySlug) return bySlug;
  return CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[slug] ?? ALL_PRODUCTS;
}

/** If the URL slug was a nested subcategory, return that filter label. */
export function resolveCatalogSubcategory(
  raw: string | null | undefined,
  parentCategory: string,
): string | null {
  const key = String(raw || "").trim().toLowerCase();
  if (!key || !parentCategory || parentCategory === ALL_PRODUCTS) return null;

  const slug = catalogCategorySlug(key);
  const legacy = LEGACY_SUBCATEGORY_SLUGS[key] ?? LEGACY_SUBCATEGORY_SLUGS[slug];
  if (legacy && legacy.parent === parentCategory) return legacy.subcategory;

  const options = CATALOG_SUBCATEGORIES[parentCategory] ?? [];
  const exact = options.find((s) => s.toLowerCase() === key);
  if (exact) return exact;
  return options.find((s) => catalogCategorySlug(s) === slug) ?? null;
}

/** Match a product to a subcategory (incl. legacy rows where category was the subcategory name). */
export function productMatchesSubcategory(product: UiProduct, subcategory: string): boolean {
  const target = String(subcategory || "").trim().toLowerCase();
  if (!target) return true;
  const sub = String(product.subcategory || "").trim().toLowerCase();
  const cat = String(product.category || "").trim().toLowerCase();
  return sub === target || cat === target;
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
