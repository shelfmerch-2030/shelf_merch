import { useEffect, useMemo, useState } from "react";
import type { UiProduct } from "@/services/mappers";
import { detailRows } from "../types";
import { SizeGuideTable } from "@/components/SizeGuideTable";

type Tab = "description" | "features" | "size";

function detailText(value: string) {
  return value.split("\n").map((line, i, lines) => (
    <span key={i}>
      {line}
      {i < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

/** Description, key features, and size guide with tabs when multiple sections exist. */
export function ProductInfoTabs({
  product,
  description,
}: {
  product: UiProduct;
  /** Shown when `product.description` is empty. */
  description?: string;
}) {
  const desc = description?.trim() || product.description?.trim() || "";
  const keyFeatures = product.keyFeatures?.trim() || "";
  const sizeGuide = product.sizeGuide?.trim() || "";

  const tabs = useMemo(
    () =>
      (
        [
          { id: "description" as const, label: "Description", show: !!desc },
          { id: "features" as const, label: "Key features", show: !!keyFeatures },
          { id: "size" as const, label: "Size Guide", show: !!sizeGuide },
        ] as const
      ).filter((tab) => tab.show),
    [desc, keyFeatures, sizeGuide],
  );

  const [activeTab, setActiveTab] = useState<Tab>("description");

  useEffect(() => {
    setActiveTab(tabs[0]?.id ?? "description");
  }, [product.id, product.nm, tabs]);

  if (!tabs.length) {
    return <p className="muted">No product information available.</p>;
  }

  const featureRows = detailRows(keyFeatures);
  const useTabs = tabs.length > 1;
  const currentTab = useTabs ? activeTab : tabs[0].id;

  return (
    <div className="pd-desc">
      {useTabs ? (
        <div className="pd-detail-tabs" role="tablist" aria-label="Product information">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={currentTab === tab.id ? "on" : ""}
              role="tab"
              aria-selected={currentTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="lbl">{tabs[0].label}</div>
      )}

      <div
        className={`pd-tab-panel pd-description-panel${currentTab === "description" ? " on" : ""}`}
        role="tabpanel"
        hidden={currentTab !== "description"}
      >
        <p style={{ whiteSpace: "pre-line" }}>{detailText(desc)}</p>
      </div>

      <div
        className={`pd-tab-panel${currentTab === "features" ? " on" : ""}`}
        role="tabpanel"
        hidden={currentTab !== "features"}
      >
        {featureRows.length > 0 ? (
          <div className="pd-feature-card">
            {featureRows.map(([label, value], i) => (
              <div key={`${label}-${i}`} className="pd-feature-row">
                <div>{label}</div>
                <div style={{ whiteSpace: "pre-line" }}>{value ? detailText(value) : null}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No key features listed.</p>
        )}
      </div>

      <div
        className={`pd-tab-panel${currentTab === "size" ? " on" : ""}`}
        role="tabpanel"
        hidden={currentTab !== "size"}
      >
        {sizeGuide ? (
          <SizeGuideTable sizeGuide={sizeGuide} />
        ) : (
          <p className="muted">No size guide available.</p>
        )}
      </div>
    </div>
  );
}
