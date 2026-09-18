/** Vanity shop URLs — {slug}.shelfmerch.io in prod, /shop/:id or /s/:slug locally. */

const SHOP_REDEEM_DOMAIN =
  (import.meta.env.VITE_SHOP_REDEEM_DOMAIN as string | undefined)?.toLowerCase() || "store";

/**
 * First labels under the redeem domain that are ShelfMerch app hosts, not shops.
 * Apex (`shelfmerch.io`) is handled separately via exact host match.
 */
const MAIN_APP_HOST_LABELS = new Set(["www", "staging"]);

export function slugifyShopName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "shop";
}

/**
 * Extract shop slug when visiting e.g. acme.shelfmerch.io.
 * Pass `hostname` (and optionally `redeemDomain`) to unit-test without a window.
 */
export function shopSlugFromHostname(
  hostname?: string,
  redeemDomain: string = SHOP_REDEEM_DOMAIN,
): string | null {
  const host = (
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  )
    .toLowerCase()
    .trim();
  if (!host || host === "localhost" || host === "127.0.0.1") return null;

  const domain = redeemDomain.toLowerCase().trim() || "store";
  if (host === domain) return null;

  const suffix = `.${domain}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) return null;
  if (MAIN_APP_HOST_LABELS.has(slug)) return null;
  return slug;
}

export function shopRedeemDisplayHost(slug: string): string {
  return `${slug}.${SHOP_REDEEM_DOMAIN}`;
}

export function shopRedeemPath(slug: string): string {
  return `/s/${slug}`;
}

/** Local/dev public storefront path by shop id. */
export function shopStorefrontPath(shopId: string): string {
  return `/shop/${shopId}`;
}

/** Shareable public storefront link (bookmarkable). */
export function shopStorefrontHref(shop: { id: string; slug?: string }): string {
  const slug = shop.slug?.trim();
  if (typeof window === "undefined") {
    return slug ? `https://${shopRedeemDisplayHost(slug)}` : shopStorefrontPath(shop.id);
  }
  if (
    import.meta.env.DEV ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return `${window.location.origin}${shopStorefrontPath(shop.id)}`;
  }
  if (slug) {
    const protocol = window.location.protocol === "http:" ? "http:" : "https:";
    return `${protocol}//${shopRedeemDisplayHost(slug)}`;
  }
  return `${window.location.origin}${shopStorefrontPath(shop.id)}`;
}

/** Shareable link (legacy redeem entry path — prefer storefront). */
export function shopRedeemHref(slug: string): string {
  if (typeof window === "undefined") {
    return `https://${shopRedeemDisplayHost(slug)}`;
  }
  if (import.meta.env.DEV) {
    return `${window.location.origin}${shopRedeemPath(slug)}`;
  }
  const protocol = window.location.protocol === "http:" ? "http:" : "https:";
  return `${protocol}//${shopRedeemDisplayHost(slug)}`;
}
