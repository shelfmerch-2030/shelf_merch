import { useState } from "react";
import type { UiProduct } from "@/services/mappers";
import { ProductThumb } from "@/features/shops/ProductThumb";
import { productColorHex, productColorNames } from "../colors";

const CATS = [
  "All Products",
  "Apparel",
  "Accessories",
  "Bags",
  "Drinkware",
  "Technology",
  "Office Supplies",
];
const CAT_MAP: Record<string, string[]> = {
  Apparel: ["tee", "hoodie", "cap"],
  Accessories: ["keychain", "key", "badge", "lanyard"],
  Bags: ["pack", "bag"],
  Drinkware: ["bottle", "mug"],
  Technology: ["power"],
  // In catalog mapping, "Office" tends to map to group `note`
  // (see `GROUP_BY_CATEGORY` in `apps/web/src/services/mappers.ts`).
  "Office Supplies": ["note", "notebook", "pen", "cardholder", "card"],
};

function matchesSwagCatalogTab(tab: string, p: UiProduct): boolean {
  if (tab === "All Products") return true;

  const g = String(p.g || "").toLowerCase().trim();
  const category = String(p.category || "").toLowerCase().trim();
  const subcategory = String(p.subcategory || "").toLowerCase().trim();
  const name = String(p.nm || "").toLowerCase().trim();
  const hay = `${category} ${subcategory} ${name}`;

  // Keep these tab labels user-friendly but match against the real underlying group/category/name
  // fields that come back from the catalog mapper.
  if (tab === "Accessories") {
    return (
      (CAT_MAP[tab] || []).includes(g) ||
      category === "accessories" ||
      category === "key chains" ||
      /key\s*chain|keychain|lanyard|badge/.test(hay)
    );
  }

  if (tab === "Office Supplies") {
    return (
      (CAT_MAP[tab] || []).includes(g) ||
      category === "office supplies" ||
      category === "card holders" ||
      /office|stationery|notebook|pen|diary|journal|note|card\s*holder|cardholder/.test(hay)
    );
  }

  return (CAT_MAP[tab] || []).includes(g);
}

export function CatalogStep({
  catalog,
  picked,
  onToggle,
  title = "Add products to your collection",
  subtitle,
}: {
  catalog: UiProduct[];
  picked: number[];
  onToggle: (index: number) => void;
  title?: string;
  subtitle?: string;
}) {
  const [cat, setCat] = useState("All Products");
  const entries = catalog
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => matchesSwagCatalogTab(cat, p));

  return (
    <>
      <h1
        style={{
          fontSize: 24,
          marginBottom: 6,
          fontFamily: "var(--disp)",
          letterSpacing: "-.02em",
        }}
      >
        {title}
      </h1>
      <p className="muted" style={{ marginBottom: 20, fontSize: 14 }}>
        {subtitle ??
          `${catalog.length} products total · Pick the items you want to brand and add to your collection.`}
      </p>

      <div
        className="tabs"
        style={{ marginBottom: 22 }}
        role="tablist"
        aria-label="Product categories"
      >
        {CATS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cat === c}
            className={cat === c ? "on" : ""}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {catalog.length === 0 ? (
        <div className="card empty" style={{ padding: 48 }}>
          <h3>No catalog products yet</h3>
          <p className="muted" style={{ marginTop: 6 }}>
            Publish products in the catalog first, then return here to pick items for your collection.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="card empty" style={{ padding: 48 }}>
          <h3>No products in this category</h3>
          <p className="muted" style={{ marginTop: 6 }}>
            Try selecting a different tab.
          </p>
        </div>
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))",
            gap: 20,
            paddingBottom: 20,
          }}
        >
          {entries.map(({ p, i }) => {
            const on = picked.includes(i);
            const swatches = productColorNames(p).slice(0, 6);
            return (
              <button
                key={p.id ?? `${p.nm}-${i}`}
                type="button"
                className="pcard"
                style={{
                  textAlign: "left",
                  ...(on
                    ? { borderColor: "var(--brand)", boxShadow: "0 0 0 2px var(--brand-50)" }
                    : {}),
                }}
                aria-pressed={on}
                onClick={() => onToggle(i)}
              >
                <div style={{ position: "relative" }}>
                  <ProductThumb product={p} />
                  <div
                    className="sw-pick-badge"
                    style={{
                      background: on ? "var(--brand)" : "#fff",
                      color: on ? "#fff" : "var(--brand)",
                    }}
                  >
                    {on ? "✓" : "+"}
                  </div>
                </div>
                <div className="meta">
                  {p.brand && <div className="brand">{p.brand}</div>}
                  <div className="nm" style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>
                    {p.nm}
                  </div>
                  <div className="pr" style={{ fontWeight: 700, marginTop: 8 }}>
                    {p.price}
                  </div>
                  {swatches.length > 0 && (
                    <div className="swatches" style={{ marginTop: 10, gap: 6 }}>
                      {swatches.map((c) => (
                        <span
                          key={c}
                          className="sw"
                          style={{ background: productColorHex(p, c) }}
                          title={c}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
