import { useEffect, useState, type CSSProperties } from "react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { DEFAULT_MOCKUP_TINT_HEX } from "./colors";
import { bakeMockup, designImgUrl, pickPrintArea, productThumbUrl } from "./mockup-bake";

/**
 * Baked composites are memoised per product + artwork + colour so re-selecting a
 * colour on the PDP is instant and grids don't re-bake.
 */
const bakeCache = new Map<string, string>();

/**
 * Renders a design at a given garment colour by re-running the SAME bake
 * pipeline used at the artwork step (realistic artwork + luma-tinted garment +
 * multiply @ 0.96) — so every colour blends identically to the default mockup.
 * While a new colour bakes, the previous frame (or the baked default) stays
 * visible to avoid flicker.
 */
function DesignComposite({
  product,
  artUrl,
  tintHex,
  fallback,
}: {
  product: UiProduct;
  artUrl: string;
  tintHex?: string;
  fallback: string;
}) {
  const key = `${product.id ?? product.nm}|${resolveMediaUrl(artUrl)}|${tintHex ?? "default"}`;
  const [src, setSrc] = useState<string>(() => bakeCache.get(key) ?? fallback);

  useEffect(() => {
    const cached = bakeCache.get(key);
    if (cached) {
      setSrc(cached);
      return;
    }
    let cancelled = false;
    bakeMockup(product, artUrl, product.placement ?? null, 1000, false, tintHex)
      .then((url) => {
        if (cancelled || !url) return;
        bakeCache.set(key, url);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, product, artUrl, tintHex]);

  return (
    <div className="img img-mockup">
      <img
        src={src || fallback}
        alt={product.nm}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </div>
  );
}

/**
 * Saved-design thumbnail. The baked Konva mockup (uploaded at the artwork step)
 * is the source of truth for the default look — it is preferred whenever
 * present. Live compositing remains for tinted colour variants (using the
 * saved placement so the artwork sits exactly where the user put it) and for
 * products that never got a bake.
 */
export function DesignedProductThumb({
  product,
  artworkUrl,
  tintHex = DEFAULT_MOCKUP_TINT_HEX,
  className,
  style,
}: {
  product: UiProduct;
  artworkUrl?: string;
  /** Garment colour for mask-based previews (store colour picker). */
  tintHex?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const baked = resolveMediaUrl(product.mockupUrl);
  const overlay = artworkUrl ? resolveMediaUrl(artworkUrl) : "";
  const printAreaBase = resolveMediaUrl(pickPrintArea(product)?.mockupImageUrl);
  const stageBase = resolveMediaUrl(product.baseImageUrl);
  const resolvedMask = resolveMediaUrl(product.maskImageUrl);
  const maskStage = resolvedMask || stageBase || printAreaBase || resolveMediaUrl(designImgUrl(product));
  const base =
    maskStage ||
    resolveMediaUrl(product.photoUrl) ||
    productThumbUrl(product, false) ||
    productThumbUrl(product, true);

  const isDefaultTint =
    !tintHex || tintHex.toLowerCase() === DEFAULT_MOCKUP_TINT_HEX.toLowerCase();
  // Re-bake only when we have both the artwork and a garment mask/stage to
  // composite on; otherwise there is nothing to recolour.
  const canRebake = Boolean(overlay && maskStage);

  const bakedImg = baked ? (
    <div className="img img-mockup">
      <img
        src={baked}
        alt={product.nm}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </div>
  ) : null;

  const inner =
    baked && isDefaultTint ? (
      bakedImg
    ) : canRebake ? (
      <DesignComposite
        product={product}
        artUrl={overlay}
        tintHex={isDefaultTint ? undefined : tintHex}
        fallback={baked || base}
      />
    ) : baked ? (
      bakedImg
    ) : (
      <div className={`img${base ? " img-mockup" : ""}`}>
        {base ? (
          <img
            src={base}
            alt={product.nm}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        ) : (
          <div
            className="sm-skeleton-img"
            aria-hidden="true"
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
    );

  if (!className && !style) return inner;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        ...(className === "sf-pdp-thumb" ? {} : { height: "100%" }),
        ...style,
      }}
    >
      {inner}
    </div>
  );
}

/** Map storefront product rows onto the shared mockup thumbnail shape. */
export function storeProductAsUi(p: {
  _id?: string;
  catalogProductId?: string;
  name: string;
  brand?: string;
  group?: string;
  maskImageUrl?: string;
  baseImageUrl?: string;
  mockupUrl?: string;
  placement?: UiProduct["placement"];
  printAreas?: UiProduct["printAreas"];
  primaryImageUrl?: string;
  imageUrls?: string[];
}): UiProduct {
  const catalogId =
    p.catalogProductId || (p._id?.includes(":") ? p._id.split(":").pop() : p._id) || undefined;
  const photo = resolveMediaUrl(p.primaryImageUrl) || resolveMediaUrl(p.imageUrls?.[0]) || "";
  const mask = resolveMediaUrl(p.maskImageUrl);
  const base = resolveMediaUrl(p.baseImageUrl);
  return {
    id: catalogId,
    g: p.group || "tee",
    brand: p.brand || "",
    nm: p.name,
    price: "",
    sw: 4,
    maskImageUrl: mask,
    baseImageUrl: base,
    imgUrl: mask || base,
    photoUrl: photo,
    mockupUrl: p.mockupUrl,
    placement: p.placement,
    printAreas: p.printAreas,
  };
}
