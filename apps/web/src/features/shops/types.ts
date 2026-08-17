import type { UiCollection, UiProduct, UiShop } from "@/services/mappers";

export const SHOP_TABS = [
  "Branded Swag",
  "Shop Catalog",
  "Sent Gifts",
  "Layout",
  "Settings",
  "Reports",
] as const;
export type ShopTab = (typeof SHOP_TABS)[number];

/** Map `?tab=layout` (etc.) to a shop detail tab. */
export function shopTabFromSearch(tab?: string): ShopTab | null {
  if (!tab) return null;
  const norm = tab.toLowerCase().replace(/[\s_-]/g, "");
  const match = SHOP_TABS.find((t) => t.toLowerCase().replace(/\s/g, "") === norm);
  return match ?? null;
}

export const SHOP_CURRENCIES = [
  {
    key: "Points",
    title: "Points",
    desc: "Display product prices in Points. Conversion: ₹1 = 2 Points.",
  },
  {
    key: "INR",
    title: "INR",
    desc: "Display product prices directly in Indian Rupees. ₹1 = 1 Credit.",
  },
] as const;

/** Shop builder category chips: [label, product group key, thumbnail under /images/landing/categories]. */
export const BUILDER_CATEGORIES: [string, string, string][] = [
  // ["Food & Beverages", "mug", "/images/landing/categories/food-beverages.png"],
  ["Work Essentials", "note", "/images/landing/categories/work-essentials.png"],
  ["Merch", "tee", "/images/landing/categories/apparel-wearables.png"],
  // ["Life & Hobbies", "cap", "/images/landing/categories/life-hobbies.png"],
  // ["Wellness", "bottle", "/images/landing/categories/wellness.png"],
  // ["Experiences", "spark", "/images/landing/categories/experiences.png"],
  ["Luxury", "bag", "/images/landing/categories/luxury.png"],
];

export const DEFAULT_BUILDER_CATEGORIES = ["Food & Beverages", "Work Essentials", "Merch"];

/** Most recently created shop (shown on home pinned shop). */
export function getLastShop(shops: UiShop[]): UiShop | null {
  if (!shops.length) return null;
  return [...shops].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  )[0];
}

/** "Created: 06/26/2026 | Jane Doe | Points" meta line for a shop card. */
export function shopCardMeta(shop: UiShop, fallbackUser: string): string {
  const date = shop.createdAt ? new Date(shop.createdAt) : new Date();
  const created = date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  return `Created: ${created}  |  ${shop.createdBy || fallbackUser}  |  ${shop.currency}`;
}

export function collectionLinkedToShop(col: UiCollection, shopId: string): boolean {
  if (!col || !shopId) return false;
  const sid = String(shopId);
  const linked = (col.shopIds || []).map(String);
  if (linked.length) return linked.includes(sid);
  return col.shopId === sid;
}

const CATEGORY_BY_GROUP: Record<string, string> = {
  tee: "Apparel",
  hoodie: "Apparel",
  mug: "Drinkware",
  bottle: "Drinkware",
  pack: "Merch",
  cap: "Merch",
  note: "Work Essentials",
  power: "Work Essentials",
  bag: "Merch",
  // pillow: "Wellness",
};

export function catalogCategoryLabel(p: UiProduct): string {
  return p.category || CATEGORY_BY_GROUP[p.g] || "Merch";
}

/** Stable selection key for a catalog product (id, or index fallback). */
export function catalogProductKey(p: UiProduct, index: number): string {
  return p.id || `demo:${index}`;
}
