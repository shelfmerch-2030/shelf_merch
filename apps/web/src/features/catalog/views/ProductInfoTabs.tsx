import { useEffect, useId, useMemo, useState } from "react";
import { detailRows } from "../types";
import { SizeGuideTable } from "@/components/SizeGuideTable";
import { FilePrintingGuidelines } from "./FilePrintingGuidelines";

type SectionId = "info" | "features" | "size" | "printing";

type ProductInfoTabsVariant = "default" | "catalog" | "shop";

export type ProductInfoSource = {
  id?: string;
  nm?: string;
  description?: string;
  keyFeatures?: string;
  sizeGuide?: string;
};

function detailText(value: string) {
  return value.split("\n").map((line, i, lines) => (
    <span key={i}>
      {line}
      {i < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "info", label: "Product Information" },
  { id: "features", label: "Key Features" },
  { id: "size", label: "Size Guide" },
  { id: "printing", label: "File & Printing Guidelines" },
];

/** Collapsible product detail sections (description, features, size guide, print guidelines). */
export function ProductInfoTabs({
  product,
  description,
  variant = "default",
  onOpenSizeGuide,
  openSection = null,
  onOpenSectionChange,
}: {
  product: ProductInfoSource;
  /** Shown when `product.description` is empty. */
  description?: string;
  variant?: ProductInfoTabsVariant;
  /** Shop/catalog: open size guide in a modal instead of inline table only. */
  onOpenSizeGuide?: () => void;
  openSection?: SectionId | null;
  onOpenSectionChange?: (section: SectionId | null) => void;
}) {
  const baseId = useId();
  const desc = description?.trim() || product.description?.trim() || "";
  const keyFeatures = product.keyFeatures?.trim() || "";
  const sizeGuide = product.sizeGuide?.trim() || "";
  const featureRows = detailRows(keyFeatures);

  const [internalOpenId, setInternalOpenId] = useState<SectionId | null>(null);
  const openId = onOpenSectionChange ? openSection : internalOpenId;

  useEffect(() => {
    if (onOpenSectionChange) onOpenSectionChange(null);
    else setInternalOpenId(null);
  }, [product.id, product.nm]);

  function toggle(id: SectionId) {
    const next = openId === id ? null : id;
    if (onOpenSectionChange) onOpenSectionChange(next);
    else setInternalOpenId(next);
  }

  const sectionContent = useMemo(
    () => ({
      info: desc ? (
        <p className="pd-accordion__desc">{detailText(desc)}</p>
      ) : (
        <p className="muted">No product information available.</p>
      ),
      features:
        featureRows.length > 0 ? (
          <div className="pd-feature-card">
            {featureRows.map(([label, value], i) => (
              <div key={`${label}-${i}`} className="pd-feature-row">
                <div>{label}</div>
                <div style={{ whiteSpace: "pre-line" }}>{value ? detailText(value) : null}</div>
              </div>
            ))}
          </div>
        ) : keyFeatures ? (
          <p className="pd-accordion__desc">{detailText(keyFeatures)}</p>
        ) : (
          <p className="muted">No key features listed.</p>
        ),
      size: sizeGuide ? (
        <>
          {onOpenSizeGuide ? (
            <div className="pd-accordion__size-head">
              <button type="button" className="pd-accordion__size-link" onClick={onOpenSizeGuide}>
                View full chart
              </button>
            </div>
          ) : null}
          <SizeGuideTable sizeGuide={sizeGuide} />
        </>
      ) : (
        <p className="muted">No size guide available.</p>
      ),
      printing: <FilePrintingGuidelines />,
    }),
    [desc, featureRows, keyFeatures, onOpenSizeGuide, sizeGuide],
  );

  if (variant === "catalog") {
    return (
      <div className="catalog-pdp-accordions" role="region" aria-label="Product details">
        {SECTIONS.map((section) => {
          const open = openId === section.id;
          return (
            <div key={section.id}>
              <button
                type="button"
                className="catalog-pdp-accordion"
                aria-expanded={open}
                onClick={() => toggle(section.id)}
              >
                <span>{section.label}</span>
                <span aria-hidden="true">{open ? "−" : "+"}</span>
              </button>
              {open ? (
                <div
                  className={`catalog-pdp-accordion-panel${section.id === "size" ? " catalog-pdp-accordion-panel--size" : ""}`}
                >
                  {sectionContent[section.id]}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === "shop") {
    return (
      <div className="sf-pdp-accordions" role="region" aria-label="Product details">
        {SECTIONS.map((section) => {
          const open = openId === section.id;
          return (
            <div key={section.id} className="sf-pdp-accordion">
              <button
                type="button"
                className="sf-pdp-accordion-head"
                aria-expanded={open}
                onClick={() => toggle(section.id)}
              >
                <span>{section.label}</span>
                <span className="sf-pdp-accordion-icon" aria-hidden="true">
                  {open ? "−" : "+"}
                </span>
              </button>
              {open ? (
                <div className="sf-pdp-accordion-body">{sectionContent[section.id]}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="pd-accordion" role="region" aria-label="Product details">
      {SECTIONS.map((section) => {
        const open = openId === section.id;
        const panelId = `${baseId}-${section.id}-panel`;
        const buttonId = `${baseId}-${section.id}-btn`;
        return (
          <div key={section.id} className={`pd-accordion__item${open ? " is-open" : ""}`}>
            <button
              type="button"
              id={buttonId}
              className="pd-accordion__trigger"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(section.id)}
            >
              <span>{section.label}</span>
              <span className="pd-accordion__icon" aria-hidden="true">
                {open ? "−" : "+"}
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className="pd-accordion__panel"
              hidden={!open}
            >
              <div className="pd-accordion__body">{sectionContent[section.id]}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
