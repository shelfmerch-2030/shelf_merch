import { useEffect, useId, useMemo, useState } from "react";
import type { UiProduct } from "@/services/mappers";
import { detailRows } from "../types";
import { SizeGuideTable } from "@/components/SizeGuideTable";

type SectionId = "info" | "size";

function detailText(value: string) {
  return value.split("\n").map((line, i, lines) => (
    <span key={i}>
      {line}
      {i < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

/** Collapsible Product Information + Size Guide (accordion with + / −). */
export function ProductInfoTabs({
  product,
  description,
}: {
  product: UiProduct;
  /** Shown when `product.description` is empty. */
  description?: string;
}) {
  const baseId = useId();
  const desc = description?.trim() || product.description?.trim() || "";
  const keyFeatures = product.keyFeatures?.trim() || "";
  const sizeGuide = product.sizeGuide?.trim() || "";
  const featureRows = detailRows(keyFeatures);

  const sections = useMemo(() => {
    const list: { id: SectionId; label: string }[] = [];
    if (desc || keyFeatures) list.push({ id: "info", label: "Product Information" });
    if (sizeGuide) list.push({ id: "size", label: "Size Guide" });
    return list;
  }, [desc, keyFeatures, sizeGuide]);

  const [openId, setOpenId] = useState<SectionId | null>(null);

  useEffect(() => {
    setOpenId(null);
  }, [product.id, product.nm]);

  if (!sections.length) {
    return <p className="muted">No product information available.</p>;
  }

  function toggle(id: SectionId) {
    setOpenId((cur) => (cur === id ? null : id));
  }

  return (
    <div className="pd-accordion" role="region" aria-label="Product details">
      {sections.map((section) => {
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
              {section.id === "info" ? (
                <div className="pd-accordion__body">
                  {desc ? <p className="pd-accordion__desc">{detailText(desc)}</p> : null}
                  {featureRows.length > 0 ? (
                    <div className="pd-feature-card">
                      {featureRows.map(([label, value], i) => (
                        <div key={`${label}-${i}`} className="pd-feature-row">
                          <div>{label}</div>
                          <div style={{ whiteSpace: "pre-line" }}>
                            {value ? detailText(value) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {!desc && featureRows.length === 0 ? (
                    <p className="muted">No product information listed.</p>
                  ) : null}
                </div>
              ) : (
                <div className="pd-accordion__body">
                  {sizeGuide ? (
                    <SizeGuideTable sizeGuide={sizeGuide} />
                  ) : (
                    <p className="muted">No size guide available.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
