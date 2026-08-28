import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { SizeGuideTable } from "@/components/SizeGuideTable";
import { detailRows, productSwatches } from "../types";

type GalleryItem = { key: string; label: string; url: string };
type AccordionId = "desc" | "materials" | "delivery";

/** Dedupe by path so Shopify primary + gallery rows with ?v= params collapse once. */
function galleryUrlKey(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const { origin, pathname } = new URL(url);
      return `${origin}${pathname}`;
    } catch {
      return url;
    }
  }
  return url;
}

/** Stage + marketing photos only — never production mask PNGs. */
function catalogGalleryItems(product: UiProduct): GalleryItem[] {
  const items: GalleryItem[] = [];
  const seen = new Set<string>();
  const add = (key: string, label: string, raw?: string) => {
    const url = resolveMediaUrl(raw);
    if (!url) return;
    const norm = galleryUrlKey(url);
    if (seen.has(norm)) return;
    seen.add(norm);
    items.push({ key, label, url });
  };

  add("front", "Front", product.baseImageUrl || product.mockupUrl);
  add("back", "Back", product.baseBackImageUrl || product.mockupBackUrl);
  add("left", "Left", product.baseLeftImageUrl);
  add("right", "Right", product.baseRightImageUrl);

  const marketing = [product.photoUrl, ...(product.imageUrls ?? [])].filter(Boolean);
  let photoIndex = 0;
  for (const raw of marketing) {
    const url = resolveMediaUrl(raw);
    if (!url) continue;
    const norm = galleryUrlKey(url);
    if (seen.has(norm)) continue;
    seen.add(norm);
    items.push({
      key: `photo-${photoIndex}`,
      label: marketing.length > 1 ? `Photo ${photoIndex + 1}` : "Photo",
      url,
    });
    photoIndex += 1;
  }

  if (!items.length) {
    add("fallback", "Photo", product.mockupUrl || product.photoUrl);
  }
  return items;
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"];

function formatRsAmount(n: number) {
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeRsLabel(raw: string) {
  return raw
    .replace(/₹|₨|â‚¹|â‚¨/g, "Rs")
    .replace(/^Rs\.?\s*/i, "Rs");
}

function distinctSizes(variants: UiProduct["variants"]): string[] {
  const sizes = [...new Set((variants || []).map((v) => v.size).filter(Boolean))] as string[];
  const rank = (s: string) => {
    const idx = SIZE_ORDER.indexOf(String(s).toUpperCase());
    return idx === -1 ? SIZE_ORDER.length : idx;
  };
  return sizes.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Read-only catalog product detail styled like retail PDP reference. */
export function ProductDetail({ product }: { product: UiProduct; index: number }) {
  const gallery = useMemo(() => catalogGalleryItems(product), [product]);
  const colorSwatches = useMemo(() => productSwatches(product), [product]);
  const [activeKey, setActiveKey] = useState(gallery[0]?.key || "");
  const [selectedSize, setSelectedSize] = useState<string | undefined>();
  const [selectedColor, setSelectedColor] = useState<string | undefined>();
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<AccordionId | null>("desc");

  useEffect(() => {
    setActiveKey(gallery[0]?.key || "");
    setSelectedSize(undefined);
    setSelectedColor(colorSwatches[0]?.name);
    setSizeGuideOpen(false);
    setOpenAccordion(product.description?.trim() ? "desc" : null);
  }, [product.id, gallery, product.description, colorSwatches]);

  useEffect(() => {
    if (!gallery.some((item) => item.key === activeKey)) {
      setActiveKey(gallery[0]?.key || "");
    }
  }, [activeKey, gallery]);

  const active = gallery.find((item) => item.key === activeKey) || gallery[0];
<<<<<<< HEAD
  const desc = product.description?.trim() || "No product information available.";
  const showThumbs = gallery.length > 1;
=======
  const desc = product.description?.trim() || "";
  const keyFeatures = product.keyFeatures?.trim() || "";
  const featureRows = detailRows(keyFeatures);
  const sizes = distinctSizes(product.variants);
>>>>>>> pr-271
  const productTitle = product.nm?.trim() || product.brand?.trim() || "Shelf Merch Product";

  const inclusiveAmount = Math.round(Number(product.basePriceInr) || 0);
  const priceLabel = inclusiveAmount
    ? formatRsAmount(inclusiveAmount)
    : normalizeRsLabel(product.price || "");

  const toggleAccordion = (id: AccordionId) => {
    setOpenAccordion((cur) => (cur === id ? null : id));
  };

  return (
    <div className="catalog-pdp">
      <div className="catalog-pdp-layout">
<<<<<<< HEAD
        <div className="sf-pdp-gallery">
          {showThumbs ? (
            <div className="sf-pdp-thumbs" role="tablist" aria-label="Product views">
              {gallery.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active?.key === item.key}
                  aria-label={item.label}
                  className={`sf-pdp-thumb-btn${active?.key === item.key ? " sf-pdp-thumb-btn--on" : ""}`}
                  onClick={() => setActiveKey(item.key)}
                >
                  <div className="sf-pdp-thumb-mini">
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          <div
            className="img catalog-pdp-main-media"
            style={{
              background: "#f4f6f4",
              borderRadius: "var(--r-sm)",
              aspectRatio: "1 / 1",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {active?.url ? (
              <img
                src={active.url}
                alt={`${product.nm} — ${active.label}`}
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
=======
        <div className="catalog-pdp-media">
          <div className="catalog-pdp-main-media">
            {active?.url ? (
              <img src={active.url} alt={`${product.nm} — ${active.label}`} />
>>>>>>> pr-271
            ) : (
              <span className="mut3">No image</span>
            )}
          </div>
        </div>

        <div className="catalog-pdp-info">
          <div className="catalog-pdp-info-top">
            <div className="catalog-pdp-badges" aria-hidden="true">
              {product.subcategory ? (
                <span className="catalog-pdp-badge catalog-pdp-badge--muted">{product.subcategory}</span>
              ) : null}
            </div>
            <button type="button" className="catalog-pdp-wishlist" aria-label="Save to wishlist">
              <Heart size={20} strokeWidth={1.5} />
            </button>
          </div>

<<<<<<< HEAD
          {showThumbs ? (
            <div className="catalog-pdp-colors">
              <div className="catalog-pdp-color-thumbs">
                {gallery.map((item) => (
=======
          <h1 className="catalog-pdp-brand">{productTitle}</h1>

          {priceLabel ? (
            <div className="catalog-pdp-price-block">
              <div className="catalog-pdp-price-row">
                <div className="catalog-pdp-price">{priceLabel}</div>
              </div>
              <p className="catalog-pdp-price-tax">MRP inclusive of all taxes</p>
            </div>
          ) : null}

          {colorSwatches.length > 0 ? (
            <div className="catalog-pdp-colour">
              <div
                className="catalog-pdp-color-swatches swatches"
                role="group"
                aria-label="Available colors"
              >
                {colorSwatches.map((color) => (
>>>>>>> pr-271
                  <button
                    key={color.name}
                    type="button"
<<<<<<< HEAD
                    aria-label={`Select ${item.label}`}
                    className={`catalog-pdp-color-thumb${active?.key === item.key ? " catalog-pdp-color-thumb--on" : ""}`}
                    onClick={() => setActiveKey(item.key)}
                  >
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                    />
                  </button>
=======
                    className={`sw catalog-pdp-color-swatch${
                      selectedColor === color.name ? " catalog-pdp-color-swatch--on" : ""
                    }`}
                    style={{ background: color.hex }}
                    title={color.name}
                    aria-label={color.name}
                    aria-pressed={selectedColor === color.name}
                    onClick={() => setSelectedColor(color.name)}
                  />
>>>>>>> pr-271
                ))}
              </div>
            </div>
          ) : null}

          {sizes.length > 0 ? (
            <div className="catalog-pdp-sizes">
              <div className="catalog-pdp-size-options" aria-label="Available sizes">
                {sizes.map((size) => {
                  const selected = selectedSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      className={`catalog-pdp-size-btn${selected ? " catalog-pdp-size-btn--on" : ""}`}
                      aria-pressed={selected}
                      onClick={() => setSelectedSize(selected ? undefined : size)}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
              {product.sizeGuide?.trim() ? (
                <div className="catalog-pdp-size-foot">
                  <button
                    type="button"
                    className="catalog-pdp-size-guide-link"
                    onClick={() => setSizeGuideOpen((open) => !open)}
                  >
                    SIZE GUIDE
                  </button>
                </div>
              ) : null}
              {sizeGuideOpen && product.sizeGuide?.trim() ? (
                <div className="catalog-pdp-size-guide-panel">
                  <SizeGuideTable sizeGuide={product.sizeGuide} />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="catalog-pdp-accordions">
            {desc ? (
              <>
                <button
                  type="button"
                  className="catalog-pdp-accordion"
                  aria-expanded={openAccordion === "desc"}
                  onClick={() => toggleAccordion("desc")}
                >
                  <span>DESCRIPTION</span>
                  <span aria-hidden="true">{openAccordion === "desc" ? "−" : "+"}</span>
                </button>
                {openAccordion === "desc" ? (
                  <div className="catalog-pdp-accordion-panel">
                    <p>{desc}</p>
                  </div>
                ) : null}
              </>
            ) : null}

            {featureRows.length > 0 ? (
              <>
                <button
                  type="button"
                  className="catalog-pdp-accordion"
                  aria-expanded={openAccordion === "materials"}
                  onClick={() => toggleAccordion("materials")}
                >
                  <span>MATERIALS</span>
                  <span aria-hidden="true">{openAccordion === "materials" ? "−" : "+"}</span>
                </button>
                {openAccordion === "materials" ? (
                  <div className="catalog-pdp-accordion-panel">
                    <div className="pd-feature-card catalog-pdp-feature-card">
                      {featureRows.map(([label, value], i) => (
                        <div key={`${label}-${i}`} className="pd-feature-row">
                          <div>{label}</div>
                          <div style={{ whiteSpace: "pre-line" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <button
              type="button"
              className="catalog-pdp-accordion"
              aria-expanded={openAccordion === "delivery"}
              onClick={() => toggleAccordion("delivery")}
            >
              <span>DELIVERY AND PAYMENT</span>
              <span aria-hidden="true">{openAccordion === "delivery" ? "−" : "+"}</span>
            </button>
            {openAccordion === "delivery" ? (
              <div className="catalog-pdp-accordion-panel">
                <p><strong>Delivery Time:</strong> 2–7 days (varies by order type and location).</p>
                <p>
                  One print location and basic decoration included on catalog products. Mockups can be
                  requested from your bag before checkout.
                </p>
                <p className="catalog-pdp-accordion-foot">
                  For more information, contact your account team for delivery, payment, and returns.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
