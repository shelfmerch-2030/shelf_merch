import { useEffect, useMemo, useState } from "react";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiProduct } from "@/services/mappers";
import { SizeGuideTable } from "@/components/SizeGuideTable";

type GalleryItem = { key: string; label: string; url: string };

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

/** Read-only catalog product detail (description / key features / size guide). */
export function ProductDetail({ product }: { product: UiProduct; index: number }) {
  const gallery = useMemo(() => catalogGalleryItems(product), [product]);
  const [activeKey, setActiveKey] = useState(gallery[0]?.key || "");
  const [openPanel, setOpenPanel] = useState<"info" | "size" | null>(null);

  useEffect(() => {
    setActiveKey(gallery[0]?.key || "");
  }, [product.id, gallery]);

  useEffect(() => {
    if (!gallery.some((item) => item.key === activeKey)) {
      setActiveKey(gallery[0]?.key || "");
    }
  }, [activeKey, gallery]);

  const active = gallery.find((item) => item.key === activeKey) || gallery[0];
  const desc = product.description?.trim() || "No product information available.";
  const showThumbs = gallery.length > 1;
  const productTitle = product.nm?.trim() || product.brand?.trim() || "Shelf Merch Product";
  const displayPriceLabel = (product.price || (product.basePriceInr ? `Rs${product.basePriceInr}` : ""))
    .replace(/₹|₨|â‚¹|â‚¨/g, "Rs")
    .replace(/^Rs\.?\s*/i, "Rs");
  const displayPriceParts = displayPriceLabel.match(/^(.*?)(Rs)\s?(.+)$/i);
  const priceLabel = (product.price || (product.basePriceInr ? `₨${product.basePriceInr}` : ""))
    .replace(/₹/g, "₨")
    .replace(/^Rs\.?\s*/i, "₨");
  const priceParts = priceLabel.match(/^(.*?)([₨₹])\s?(.+)$/u);

  void priceLabel;
  void priceParts;

  return (
    <div className="catalog-pdp">
      <div className="catalog-pdp-layout">
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
            ) : (
              <span className="mut3">No image</span>
            )}
          </div>
        </div>

        <div className="catalog-pdp-info">
          <div className="catalog-pdp-summary">
            <h1 className="catalog-pdp-brand">{productTitle}</h1>
            {displayPriceLabel ? (
              <div className="catalog-pdp-price-block">
                <div className="catalog-pdp-price">
                  {displayPriceParts ? (
                    <>
                      {displayPriceParts[1] ? <span className="catalog-pdp-price-prefix">{displayPriceParts[1]}</span> : null}
                      <span className="catalog-pdp-price-symbol">₹ </span>
                      <span className="catalog-pdp-price-amount">{displayPriceParts[3]}</span>
                    </>
                  ) : (
                    displayPriceLabel
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {showThumbs ? (
            <div className="catalog-pdp-colors">
              <div className="catalog-pdp-color-thumbs flex flex-row gap-2">
                {gallery.map((item) => (
                  <button
                    key={item.key}
                    type="button"
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
                ))}
              </div>
            </div>
          ) : null}

          <p className="catalog-pdp-ready">Mockups can be requested from your bag.</p>

          <div className="catalog-pdp-accordions">
            <button
              type="button"
              className="catalog-pdp-accordion"
              aria-expanded={openPanel === "info"}
              onClick={() => setOpenPanel(openPanel === "info" ? null : "info")}
            >
              <span>Product Information</span>
              <span aria-hidden="true">{openPanel === "info" ? "−" : "+"}</span>
            </button>
            {openPanel === "info" ? (
              <div className="catalog-pdp-accordion-panel">
                <p>{desc}</p>
              </div>
            ) : null}

            <button
              type="button"
              className="catalog-pdp-accordion"
              aria-expanded={openPanel === "size"}
              onClick={() => setOpenPanel(openPanel === "size" ? null : "size")}
            >
              <span>Size Guide</span>
              <span aria-hidden="true">{openPanel === "size" ? "−" : "+"}</span>
            </button>
            {openPanel === "size" ? (
              <div className="catalog-pdp-accordion-panel catalog-pdp-accordion-panel--size">
                {product.sizeGuide?.trim() ? (
                  <SizeGuideTable sizeGuide={product.sizeGuide} />
                ) : (
                  <p>No size guide available.</p>
                )}
              </div>
            ) : null}
          </div>

          <p className="catalog-pdp-print-note">
            <span aria-hidden="true">▣</span> One print location and basic decoration included. Learn more ↗
          </p>
        </div>
      </div>
    </div>
  );
}
