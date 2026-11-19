import { useEffect } from "react";
import { useLocation, useMatches } from "react-router";
import { shopSlugFromHostname } from "@/lib/shopRedeemUrl";
import catalog from "@/seo/publicPages.json";
import { resolveSpaSeo } from "../../../api/src/modules/seo/resolvePublicSeo.js";

type SeoDocument = {
  mode: "public" | "private" | "preserve" | "unknown";
  title: string | null;
  description: string | null;
  robots: string | null;
  canonical: string | null;
  image: string | null;
  jsonLd: unknown;
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function removeMeta(attr: "name" | "property", key: string) {
  document.head.querySelector(`meta[${attr}="${key}"]`)?.remove();
}

/** Keeps the document head aligned after client-side navigations. Does not emit analytics. */
export function usePublicSeo() {
  const { pathname } = useLocation();
  // Matched private pages can own their title without duplicating tenant URL rules.
  const privateTitle = useMatches().reduce<string | undefined>((title, match) =>
    (match.handle as { privateTitle?: string } | undefined)?.privateTitle ?? title, undefined);

  useEffect(() => {
    if (shopSlugFromHostname()) return;
    const seo = (privateTitle ? { mode: "private", title: privateTitle, robots: "noindex, nofollow" }
      : resolveSpaSeo(catalog, pathname)) as SeoDocument;
    if (seo.mode === "preserve") return;

    if (seo.mode === "private") {
      const previousTitle = document.title;
      if (seo.title) document.title = seo.title;
      upsertMeta("name", "robots", seo.robots || "noindex, nofollow");
      document.head.querySelector('link[rel="canonical"]')?.remove();
      removeMeta("property", "og:url");
      document.getElementById("seo-jsonld")?.remove();
      // Do not leave a page-specific title behind on another private route.
      return seo.title ? () => { if (document.title === seo.title) document.title = previousTitle; } : undefined;
    }

    document.title = seo.title || document.title;
    upsertMeta("name", "description", seo.description || "");
    upsertMeta("name", "robots", seo.robots || "noindex, follow");
    upsertMeta("property", "og:title", seo.title || "");
    upsertMeta("property", "og:description", seo.description || "");
    upsertMeta("property", "og:type", "website");

    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (seo.canonical) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = seo.canonical;
      upsertMeta("property", "og:url", seo.canonical);
    } else {
      canonical?.remove();
      removeMeta("property", "og:url");
    }

    if (seo.image) {
      upsertMeta("property", "og:image", seo.image);
      upsertMeta("name", "twitter:image", seo.image);
      upsertMeta("name", "twitter:card", "summary_large_image");
    }

    const existing = document.getElementById("seo-jsonld");
    if (seo.jsonLd) {
      const script = existing ?? document.createElement("script");
      script.id = "seo-jsonld";
      script.setAttribute("type", "application/ld+json");
      script.textContent = JSON.stringify(seo.jsonLd);
      if (!existing) document.head.appendChild(script);
    } else {
      existing?.remove();
    }
  }, [pathname, privateTitle]);
}
