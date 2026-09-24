/** Vanity shop URLs — {slug}.shelfmerch.io in prod, /shop/:id or /s/:slug on local/staging. */

const SHOP_REDEEM_DOMAIN =
  (import.meta.env.VITE_SHOP_REDEEM_DOMAIN as string | undefined)?.toLowerCase() || "store";

/**
 * First labels under the redeem domain that are ShelfMerch app hosts, not shops.
 * Apex (`shelfmerch.io`) is handled separately via exact host match.
 */
const MAIN_APP_HOST_LABELS = new Set(["www", "staging"]);

export type ShopLinkLocation = {
  hostname: string;
  origin?: string;
  host?: string;
  protocol?: string;
};

function resolveHostname(hostname?: string): string {
  return (
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  )
    .toLowerCase()
    .trim();
}

function resolveLocation(location?: ShopLinkLocation): ShopLinkLocation | undefined {
  if (location) return location;
  if (typeof window === "undefined") return undefined;
  return window.location;
}

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
  const host = resolveHostname(hostname);
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

/**
 * Use `/s/:slug` (or `/shop/:id`) on local, staging, and preview hosts.
 * Production apex, www, and shop subdomains keep vanity `{slug}.shelfmerch.io`.
 */
export function usesPathStorefront(
  hostname?: string,
  redeemDomain: string = SHOP_REDEEM_DOMAIN,
): boolean {
  const host = resolveHostname(hostname);
  if (!host || host === "localhost" || host === "127.0.0.1") return true;
  const domain = redeemDomain.toLowerCase().trim() || "store";
  if (host === domain || host === `www.${domain}`) return false;
  // Production apex even when VITE_SHOP_REDEEM_DOMAIN is unset in tests/local builds.
  if (host === "shelfmerch.io" || host === "www.shelfmerch.io") return false;
  if (shopSlugFromHostname(host, domain) || shopSlugFromHostname(host, "shelfmerch.io")) {
    return false;
  }
  return true;
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

function vanityHref(slug: string, protocol?: string): string {
  const scheme = protocol === "http:" ? "http:" : "https:";
  return `${scheme}//${shopRedeemDisplayHost(slug)}`;
}

function pathStorefrontHref(shop: { id: string; slug?: string }, origin: string): string {
  const slug = shop.slug?.trim();
  return `${origin}${slug ? shopRedeemPath(slug) : shopStorefrontPath(shop.id)}`;
}

/** Shareable public storefront link (bookmarkable). */
export function shopStorefrontHref(
  shop: { id: string; slug?: string },
  location?: ShopLinkLocation,
): string {
  const loc = resolveLocation(location);
  const slug = shop.slug?.trim();
  if (!loc) {
    return slug ? vanityHref(slug) : shopStorefrontPath(shop.id);
  }
  if (usesPathStorefront(loc.hostname)) {
    return pathStorefrontHref(shop, loc.origin ?? `https://${loc.hostname}`);
  }
  if (slug) return vanityHref(slug, loc.protocol);
  return `${loc.origin ?? ""}${shopStorefrontPath(shop.id)}`;
}

/** Shareable link — same host rules as the storefront. */
export function shopRedeemHref(slug: string, location?: ShopLinkLocation): string {
  return shopStorefrontHref({ id: "", slug }, location);
}

/** Button / caption text that matches the URL we copy or open. */
export function shopPublicLinkLabel(slug: string, location?: ShopLinkLocation): string {
  const loc = resolveLocation(location);
  if (loc && usesPathStorefront(loc.hostname)) {
    return `${loc.host || loc.hostname}${shopRedeemPath(slug)}`;
  }
  return shopRedeemDisplayHost(slug);
}
