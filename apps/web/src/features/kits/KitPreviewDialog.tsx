import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DesignedProductThumb } from "@/features/swag/DesignedProductThumb";
import { resolveColorHex } from "@/lib/colorMap";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { PlatformKitTemplate } from "@/services/api-bridge";
import type { UiKit, UiProduct } from "@/services/mappers";
import { inr } from "@/components/platform/platform-ui";

export type KitPreviewProduct = {
  key: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  product?: UiProduct;
  variants: Array<{ size?: string; color?: string; colorHex?: string; material?: string }>;
};

export type KitPreviewData = {
  name: string;
  description: string;
  coverImage?: string;
  artworkUrl?: string;
  packaging?: string;
  /** GST-inclusive curated kit price (platformkits.approxValueInr). */
  pricePerKitInr?: number;
  products: KitPreviewProduct[];
  /** Curated kits only — visual appearance options (selection is local/UI-only). */
  variantImages?: string[];
};

type ColorOption = { name: string; hex: string };
type Availability = { colors: ColorOption[]; sizes: string[] };

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(key);
  }
  return out;
}

function productAvailability(
  variants: KitPreviewProduct["variants"],
  product?: UiProduct,
): Availability {
  const sizeNames = uniquePreserveOrder(
    (variants || []).map((v) => v.size || "").filter(Boolean),
  );
  const colorNames = uniquePreserveOrder([
    ...(product?.colors || []),
    ...(variants || []).map((v) => v.color || "").filter(Boolean),
  ]);

  const colors: ColorOption[] = colorNames.map((name) => {
    const fromVariant = variants?.find(
      (v) => v.color?.toLowerCase() === name.toLowerCase() && v.colorHex,
    )?.colorHex;
    const fromMap = product?.colorHexByName
      ? Object.entries(product.colorHexByName).find(
          ([k]) => k.toLowerCase() === name.toLowerCase(),
        )?.[1]
      : undefined;
    return { name, hex: resolveColorHex(name, fromVariant || fromMap) };
  });

  return { colors, sizes: sizeNames };
}

function productImageUrl(product?: UiProduct): string | undefined {
  if (!product) return undefined;
  return (
    resolveMediaUrl(product.mockupUrl) ||
    resolveMediaUrl(product.photoUrl) ||
    resolveMediaUrl(product.imgUrl) ||
    undefined
  );
}

type CuratedImageSource = {
  originalId?: string;
  heroImage?: string;
  imageUrls?: string[];
  itemImages?: Array<{ imageUrl: string; label?: string }>;
  variantImages?: string[];
  approxValueInr?: number;
};

function galleryUrlsExcludingHero(source: CuratedImageSource): string[] {
  const hero = String(source.heroImage || source.imageUrls?.[0] || "").trim();
  const variantSet = new Set((source.variantImages || []).map(String));
  return uniquePreserveOrder(
    (source.imageUrls || []).filter((url) => {
      const u = String(url).trim();
      return u && u !== hero && !variantSet.has(u);
    }),
  );
}

/** Build included-product cards for curated kits — never catalog productRefs. */
function buildCuratedItemProducts(
  source: CuratedImageSource,
  fallbackCover?: string,
): KitPreviewProduct[] {
  if (Array.isArray(source.itemImages) && source.itemImages.length > 0) {
    return source.itemImages.map((item, i) => ({
      key: `item-${i}-${item.imageUrl}`,
      name: item.label?.trim() || `Item ${i + 1}`,
      imageUrl: resolveMediaUrl(item.imageUrl),
      variants: [],
    }));
  }

  const gallery = galleryUrlsExcludingHero(source);
  if (gallery.length > 0) {
    return gallery.map((url, i) => ({
      key: `gallery-${i}-${url}`,
      name: `Item ${i + 1}`,
      imageUrl: resolveMediaUrl(url),
      variants: [],
    }));
  }

  const hero =
    (source.heroImage ? resolveMediaUrl(source.heroImage) : undefined) ||
    (source.imageUrls?.[0] ? resolveMediaUrl(source.imageUrls[0]) : undefined) ||
    fallbackCover;
  if (hero) {
    return [
      {
        key: "hero-fallback",
        name: "Kit contents",
        imageUrl: hero,
        variants: [],
      },
    ];
  }

  return [];
}

function mergeCuratedImageSource(
  meta?: CuratedImageSource | null,
  platform?: CuratedImageSource | null,
): CuratedImageSource {
  return {
    heroImage: meta?.heroImage || platform?.heroImage,
    imageUrls: meta?.imageUrls?.length ? meta.imageUrls : platform?.imageUrls,
    itemImages: meta?.itemImages?.length ? meta.itemImages : platform?.itemImages,
    variantImages: meta?.variantImages?.length ? meta.variantImages : platform?.variantImages,
  };
}

function findPlatformKitForMeta(
  meta: { originalId?: string } | null | undefined,
  platformKits?: PlatformKitTemplate[],
): PlatformKitTemplate | undefined {
  if (!meta?.originalId || !platformKits?.length) return undefined;
  return platformKits.find((k) => String(k._id) === String(meta.originalId));
}

/** Included item cards for curated kits (preview, send flow, etc.). */
export function curatedIncludedItems(
  meta: CuratedImageSource,
  platformKits?: PlatformKitTemplate[],
  fallbackCover?: string,
): Array<{ imageUrl: string; label: string }> {
  const platformKit = findPlatformKitForMeta(meta, platformKits);
  const source = mergeCuratedImageSource(meta, platformKit ?? null);
  return buildCuratedItemProducts(source, fallbackCover).map((item) => ({
    imageUrl: item.imageUrl || fallbackCover || "",
    label: item.name,
  }));
}

/** Build a read-only preview model from a workspace kit + catalog. */
export function buildKitPreviewFromWorkspace(
  kit: UiKit,
  catalog: UiProduct[],
  fallbackCover?: string,
  platformKits?: PlatformKitTemplate[],
): KitPreviewData {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  let description = kit.description?.trim() || "";
  let coverFromMeta: string | undefined;
  let itemProducts: KitPreviewProduct[] | undefined;
  let variantImages: string[] | undefined;
  let isCurated = false;
  let curatedMeta: CuratedImageSource | null = null;

  try {
    if (kit.designNotes) {
      const meta = JSON.parse(kit.designNotes) as {
        curated?: boolean;
        originalId?: string;
        description?: string;
        imageUrls?: string[];
        heroImage?: string;
        itemImages?: Array<{ imageUrl: string; label?: string }>;
        variantImages?: string[];
        approxValueInr?: number;
      };
      if (meta.curated) {
        isCurated = true;
        curatedMeta = meta;
      }
      if (!description && meta.description) description = meta.description;
      if (meta.heroImage) {
        coverFromMeta = resolveMediaUrl(meta.heroImage);
      } else if (meta.imageUrls?.[0]) {
        coverFromMeta = resolveMediaUrl(meta.imageUrls[0]);
      }
      if (meta.curated && Array.isArray(meta.variantImages) && meta.variantImages.length > 0) {
        variantImages = meta.variantImages
          .map((url) => resolveMediaUrl(url) || url)
          .filter(Boolean);
      }
    }
  } catch {
    /* ignore */
  }

  if (isCurated) {
    const platformKit = findPlatformKitForMeta(curatedMeta, platformKits);
    const imageSource = mergeCuratedImageSource(curatedMeta, platformKit ?? null);
    if (!coverFromMeta) {
      coverFromMeta =
        (imageSource.heroImage ? resolveMediaUrl(imageSource.heroImage) : undefined) ||
        (imageSource.imageUrls?.[0] ? resolveMediaUrl(imageSource.imageUrls[0]) : undefined);
    }
    if (!variantImages?.length && imageSource.variantImages?.length) {
      variantImages = imageSource.variantImages
        .map((url) => resolveMediaUrl(url) || url)
        .filter(Boolean);
    }
    itemProducts = buildCuratedItemProducts(imageSource, fallbackCover);
  }

  const products: KitPreviewProduct[] =
    itemProducts ??
    (kit.productRefs ?? []).map((ref, i) => {
      const product = byId.get(ref.catalogProductId);
      return {
        key: `${ref.catalogProductId}-${i}`,
        name: ref.name || product?.nm || "Product",
        brand: ref.brand || product?.brand,
        imageUrl: productImageUrl(product),
        product,
        variants: product?.variants ?? [],
      };
    });

  const platformKitForPrice = isCurated
    ? findPlatformKitForMeta(curatedMeta, platformKits)
    : undefined;
  const pricePerKitInr = isCurated
    ? Math.max(
        0,
        Math.round(
          Number(platformKitForPrice?.approxValueInr) ||
            Number((curatedMeta as { approxValueInr?: number } | null)?.approxValueInr) ||
            Number(kit.kitPrice) ||
            0,
        ),
      )
    : undefined;

  return {
    name: kit.name,
    description: description || "No description available.",
    coverImage:
      (kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : undefined) ||
      coverFromMeta ||
      fallbackCover,
    artworkUrl: kit.artworkUrl,
    packaging: kit.packaging === "box" ? "Premium box" : kit.packaging === "none" ? "No packaging" : kit.packaging,
    pricePerKitInr: pricePerKitInr && pricePerKitInr > 0 ? pricePerKitInr : undefined,
    products,
    variantImages,
  };
}

/** Build a read-only preview model from a curated platform template + catalog. */
export function buildKitPreviewFromPlatform(
  kit: PlatformKitTemplate,
  catalog: UiProduct[],
  fallbackCover?: string,
): KitPreviewData {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const heroImage =
    (kit.heroImage ? resolveMediaUrl(kit.heroImage) : undefined) ||
    (kit.imageUrls?.[0] ? resolveMediaUrl(kit.imageUrls[0]) : undefined) ||
    fallbackCover;

  const products = buildCuratedItemProducts(kit, fallbackCover);

  // Manually composed kits may still reference catalog products.
  if (!products.length && (kit.items ?? []).length > 0) {
    (kit.items ?? []).forEach((item, i) => {
      const product = byId.get(String(item.catalogProductId));
      products.push({
        key: `${item.catalogProductId}-${i}`,
        name: product?.nm || "Product",
        brand: product?.brand,
        imageUrl: productImageUrl(product) || heroImage,
        product,
        variants: product?.variants ?? [],
      });
    });
  }

  return {
    name: kit.name,
    description: kit.description?.trim() || "No description available.",
    coverImage: heroImage,
    pricePerKitInr: (() => {
      const n = Math.round(Number(kit.approxValueInr) || 0);
      return n > 0 ? n : undefined;
    })(),
    products,
    variantImages: (kit.variantImages || [])
      .map((url) => resolveMediaUrl(url) || url)
      .filter(Boolean),
  };
}

const btnGhostStyle: CSSProperties = {
  border: "1px solid var(--line)",
  padding: "8px 24px",
  borderRadius: 6,
  fontWeight: 700,
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--gray-500)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

function ProductAvailability({
  colors,
  sizes,
}: {
  colors: ColorOption[];
  sizes: string[];
}) {
  if (!colors.length && !sizes.length) return null;

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      {colors.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Colours</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {colors.slice(0, 10).map((c) => (
              <span
                key={c.name}
                title={c.name}
                aria-label={c.name}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: c.hex,
                  border: "1.5px solid rgba(0,0,0,.18)",
                  display: "inline-block",
                  flexShrink: 0,
                  cursor: "default",
                }}
              />
            ))}
            {colors.length > 10 && (
              <span style={{ fontSize: 11, color: "var(--gray-500)" }}>
                +{colors.length - 10}
              </span>
            )}
          </div>
        </div>
      )}
      {sizes.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 4 }}>Sizes</div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.35 }}>
            {sizes.join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shared read-only kit preview used by Recent Activity, Customised Kits, and Curated Kits.
 * Actions (Send / Edit) stay outside this dialog — callers close and navigate themselves.
 */
export function KitPreviewDialog({
  data,
  open,
  onOpenChange,
}: {
  data: KitPreviewData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const productCount = data?.products.length ?? 0;
  const wide = productCount > 4 || (data?.variantImages?.length ?? 0) > 0;
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedVariant(null);
      return;
    }
    setSelectedVariant(data?.variantImages?.[0] ?? null);
  }, [open, data?.name, data?.variantImages]);

  const productCards = useMemo(() => {
    if (!data) return [];
    return data.products.map((p) => ({
      ...p,
      availability: productAvailability(p.variants, p.product),
    }));
  }, [data]);

  return (
    <Dialog open={open && data !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm-modal"
        style={{
          maxWidth: wide ? 850 : 640,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {data && (
          <div className="modal-pad" style={{ padding: "24px 32px" }}>
            {data.coverImage && (
              <div
                style={{
                  width: "100%",
                  height: 180,
                  borderRadius: 10,
                  background: "var(--gray-50)",
                  border: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                  overflow: "hidden",
                  padding: 12,
                }}
              >
                <img
                  src={data.coverImage}
                  alt=""
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                marginBottom: 12,
              }}
            >
              <DialogTitle
                style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)", margin: 0 }}
              >
                {data.name}
              </DialogTitle>
              {data.pricePerKitInr != null && data.pricePerKitInr > 0 ? (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ ...labelStyle, marginBottom: 2 }}>Price per kit</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>
                    {inr(data.pricePerKitInr)}
                  </div>
                </div>
              ) : null}
            </div>

            <p style={{ color: "var(--gray-500)", fontSize: 14, lineHeight: 1.5, margin: "0 0 12px" }}>
              {data.description}
            </p>
            {data.packaging ? (
              <p className="muted" style={{ fontSize: 13, margin: "0 0 20px" }}>
                Packaging: <strong style={{ color: "var(--ink)" }}>{data.packaging}</strong>
              </p>
            ) : (
              <div style={{ marginBottom: 8 }} />
            )}

            <div style={{ borderBottom: "1px solid var(--line)", marginBottom: 16 }} />

            <div style={{ marginBottom: 20 }}>
              <h4
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--gray-500)",
                  marginBottom: 12,
                }}
              >
                Included Products ({productCount})
              </h4>

              {productCards.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  No products in this kit.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 16,
                  }}
                >
                  {productCards.map((p) => (
                    <div
                      key={p.key}
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        padding: 12,
                        background: "var(--gray-50)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: "1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        {p.product && data.artworkUrl ? (
                          <DesignedProductThumb product={p.product} artworkUrl={data.artworkUrl} />
                        ) : p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                          />
                        ) : (
                          <div
                            className="sm-skeleton-img"
                            aria-hidden="true"
                            style={{ width: "100%", height: "100%" }}
                          />
                        )}
                      </div>
                      <div>
                        {p.brand ? (
                          <div style={labelStyle}>{p.brand}</div>
                        ) : null}
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                          {p.name}
                        </div>
                        <ProductAvailability
                          colors={p.availability.colors}
                          sizes={p.availability.sizes}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(data.variantImages?.length ?? 0) > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <h4
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "var(--gray-500)",
                    marginBottom: 12,
                  }}
                >
                  Variants
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 12,
                  }}
                >
                  {data.variantImages!.map((url, idx) => {
                    const selected = selectedVariant === url;
                    return (
                      <button
                        key={`${url}-${idx}`}
                        type="button"
                        onClick={() => setSelectedVariant(url)}
                        style={{
                          border: selected ? "2px solid var(--brand)" : "1px solid var(--line)",
                          borderRadius: 8,
                          padding: 10,
                          background: selected ? "var(--surface-2)" : "var(--gray-50)",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            aspectRatio: "1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            marginBottom: 8,
                          }}
                        >
                          <img
                            src={url}
                            alt={`Variant ${idx + 1}`}
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                          />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
                          Variant {idx + 1}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onOpenChange(false)}
                style={btnGhostStyle}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
