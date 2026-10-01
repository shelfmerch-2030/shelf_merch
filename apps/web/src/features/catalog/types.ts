import { productVariantSwatches } from "@/lib/variantColors";
import type { UiProduct } from "@/services/mappers";

/** Category tabs, matching the legacy catalog filter rail. */
export const CATALOG_CATEGORIES = [
  "All Products",
  "Apparel",
  "Accessories",
  "Food & Beverage",
  "Kits",
] as const;

export const ALL_PRODUCTS = "All Products";
export const KITS_CATEGORY = "Kits";
export const PREDESIGNED_KITS_SUBCATEGORY = "Pre-designed kits";
export const CUSTOMISED_KITS_SUBCATEGORY = "Customised kits";

/** Subcategories shown on each category browse page. */
export const CATALOG_SUBCATEGORIES: Record<string, readonly string[]> = {
  Apparel: ["T-Shirts", "Polo Shirts", "Hoodies & Sweatshirts", "Jackets", "Caps", "Others"],
  Accessories: [
    "Stationery",
    "Drinkware",
    "Bags",
    "Travel Accessories",
    "Electronics & Gadgets",
    "Others",
  ],
  "Food & Beverage": ["Coffee", "Snacks", "Chocolates"],
  // Kept so storefronts can still order products whose category string is the old parent name.
  Bags: ["Backpacks", "Tote Bags", "Laptop Bags", "Duffel Bags", "Messenger Bags", "Others"],
  Drinkware: ["Bottles", "Mugs", "Tumblers", "Flasks", "Sippers", "Others"],
  "Office Supplies": ["Notebooks", "Diaries", "Pens", "Desk Accessories", "Calendars", "Card Holders", "Others"],
  Technology: ["Power Banks", "Wireless Chargers", "Speakers", "Headphones", "USB Drives", "Others"],
  Kits: [PREDESIGNED_KITS_SUBCATEGORY, CUSTOMISED_KITS_SUBCATEGORY],
};

/** Legacy subcategory URL slugs that resolve to a parent category + subcategory filter. */
const LEGACY_SUBCATEGORY_SLUGS: Record<string, { parent: string; subcategory: string }> = {
  keys: { parent: "Accessories", subcategory: "Key Chains" },
  "key-chains": { parent: "Accessories", subcategory: "Key Chains" },
  "key chains": { parent: "Accessories", subcategory: "Key Chains" },
  cardholders: { parent: "Accessories", subcategory: "Card Holders" },
  "card-holders": { parent: "Accessories", subcategory: "Card Holders" },
  "card holders": { parent: "Accessories", subcategory: "Card Holders" },
  bags: { parent: "Accessories", subcategory: "Bags" },
  "bags & travel": { parent: "Accessories", subcategory: "Bags" },
  "bags-travel": { parent: "Accessories", subcategory: "Bags" },
  drinkware: { parent: "Accessories", subcategory: "Drinkware" },
  technology: { parent: "Accessories", subcategory: "Electronics & Gadgets" },
  office: { parent: "Accessories", subcategory: "Stationery" },
  "office supplies": { parent: "Accessories", subcategory: "Stationery" },
  "office-supplies": { parent: "Accessories", subcategory: "Stationery" },
};

const CATEGORY_ALIASES: Record<string, (typeof CATALOG_CATEGORIES)[number]> = {
  apparel: "Apparel",
  accessories: "Accessories",
  bags: "Accessories",
  "bags & travel": "Accessories",
  "bags-travel": "Accessories",
  drinkware: "Accessories",
  technology: "Accessories",
  office: "Accessories",
  "office supplies": "Accessories",
  "office-supplies": "Accessories",
  "food & beverage": "Food & Beverage",
  "food-beverage": "Food & Beverage",
  "food-and-beverage": "Food & Beverage",
  all: "All Products",
  kits: "Kits",
  keys: "Accessories",
  "key-chains": "Accessories",
  "key chains": "Accessories",
  cardholders: "Accessories",
  "card-holders": "Accessories",
  "card holders": "Accessories",
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

export type CatalogCategoryNode = {
  name: string;
  slug: string;
  children: { name: string; slug: string }[];
};

/** Used when the category API has not been seeded yet. Live browse prefers the API tree. */
export const FALLBACK_CATALOG_NODES: CatalogCategoryNode[] = CATALOG_CATEGORIES.filter(
  (category) => category !== ALL_PRODUCTS,
).map((name) => ({
  name,
  slug: catalogCategorySlug(name),
  children: (CATALOG_SUBCATEGORIES[name] ?? []).map((child) => ({
    name: child,
    slug: catalogCategorySlug(child),
  })),
}));

/** Map a landing/query category string onto a catalog tab. */
export function resolveCatalogCategory(
  raw: string | null | undefined,
  nodes: readonly { name: string; slug: string }[] = FALLBACK_CATALOG_NODES,
): string {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return ALL_PRODUCTS;
  const slug = catalogCategorySlug(key);
  const list = nodes.length ? nodes : FALLBACK_CATALOG_NODES;
  const exact = list.find(
    (category) =>
      category.name.toLowerCase() === key ||
      category.slug === slug ||
      catalogCategorySlug(category.name) === slug,
  );
  if (exact) return exact.name;
  return CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[slug] ?? ALL_PRODUCTS;
}

/** If the URL slug was a nested subcategory, return that filter label. */
export function resolveCatalogSubcategory(
  raw: string | null | undefined,
  parentCategory: string,
  options?: readonly string[],
): string | null {
  const key = String(raw || "").trim().toLowerCase();
  if (!key || !parentCategory || parentCategory === ALL_PRODUCTS) return null;

  const slug = catalogCategorySlug(key);
  const legacy = LEGACY_SUBCATEGORY_SLUGS[key] ?? LEGACY_SUBCATEGORY_SLUGS[slug];
  if (legacy && legacy.parent === parentCategory) return legacy.subcategory;

  const list = options ?? CATALOG_SUBCATEGORIES[parentCategory] ?? [];
  const exact = list.find((item) => item.toLowerCase() === key);
  if (exact) return exact;
  return list.find((item) => catalogCategorySlug(item) === slug) ?? null;
}

/**
 * Style-carousel / browse target: prefer subcategory (wizard taxonomy), else parent category.
 * Resolves legacy aliases and any subcategory name from the live category tree.
 */
export function resolveCatalogBrowseTarget(
  raw: string | null | undefined,
  nodes: readonly CatalogCategoryNode[] = FALLBACK_CATALOG_NODES,
): { category: string; subcategory: string | null; query: string } {
  const key = String(raw || "").trim().toLowerCase();
  const slug = catalogCategorySlug(key);
  const list = nodes.length ? nodes : FALLBACK_CATALOG_NODES;

  if (!key) {
    return { category: ALL_PRODUCTS, subcategory: null, query: ALL_PRODUCTS };
  }

  // Match a subcategory anywhere in the tree first (same labels as the product wizard).
  for (const node of list) {
    const child = node.children.find(
      (entry) =>
        entry.name.toLowerCase() === key ||
        entry.slug === slug ||
        catalogCategorySlug(entry.name) === slug,
    );
    if (child) {
      return { category: node.name, subcategory: child.name, query: child.name };
    }
  }

  const parent = resolveCatalogCategory(raw, list);
  if (parent === ALL_PRODUCTS) {
    return { category: ALL_PRODUCTS, subcategory: null, query: ALL_PRODUCTS };
  }

  const options =
    list.find((node) => node.name === parent)?.children.map((child) => child.name) ??
    CATALOG_SUBCATEGORIES[parent] ??
    [];
  const subcategory = resolveCatalogSubcategory(raw, parent, options);
  return {
    category: parent,
    subcategory,
    query: subcategory ?? parent,
  };
}

/**
 * Landing style tiles from the wizard taxonomy:
 * Apparel stays a parent category; every other root expands to its subcategories.
 */
export function buildStyleTaxonomyTiles(
  nodes: readonly CatalogCategoryNode[],
): { label: string; browseKey: string; parentCategory: string }[] {
  const list = nodes.length ? nodes : FALLBACK_CATALOG_NODES;
  const tiles: { label: string; browseKey: string; parentCategory: string }[] = [];

  for (const node of list) {
    if (node.name === "Apparel") {
      tiles.push({ label: "Apparel", browseKey: "Apparel", parentCategory: "Apparel" });
      continue;
    }
    for (const child of node.children) {
      if (child.name === "Others") continue;
      tiles.push({
        label: child.name,
        browseKey: child.name,
        parentCategory: node.name,
      });
    }
  }

  return tiles;
}

/** Match a product to a subcategory (incl. legacy rows where category was the subcategory name). */
export function productMatchesSubcategory(product: UiProduct, subcategory: string): boolean {
  const target = String(subcategory || "").trim().toLowerCase();
  if (!target) return true;
  const sub = String(product.subcategory || "").trim().toLowerCase();
  const cat = String(product.category || "").trim().toLowerCase();
  return sub === target || cat === target;
}

/** Best display photo for a catalog product. */
export function productPhotoUrl(product: UiProduct): string | undefined {
  return product.photoUrl || product.imageUrls?.[0] || product.imgUrl || undefined;
}

/**
 * Style-carousel tile image: prefer a product in the subcategory (wizard taxonomy),
 * otherwise fall back to a product in the parent category (e.g. Apparel).
 */
export function pickStyleTileImage(
  products: readonly UiProduct[],
  browseKey: string,
  fallback: string,
  nodes: readonly CatalogCategoryNode[] = FALLBACK_CATALOG_NODES,
): string {
  const { category, subcategory } = resolveCatalogBrowseTarget(browseKey, nodes);
  const withPhoto = (product: UiProduct) => Boolean(productPhotoUrl(product));

  if (subcategory) {
    const bySub = products.find((product) => productMatchesSubcategory(product, subcategory) && withPhoto(product));
    const subUrl = bySub ? productPhotoUrl(bySub) : undefined;
    if (subUrl) return subUrl;
  }

  const byCategory = products.find((product) => {
    const cat = String(product.category || "").trim().toLowerCase();
    return cat === category.toLowerCase() && withPhoto(product);
  });
  return (byCategory && productPhotoUrl(byCategory)) || fallback;
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
