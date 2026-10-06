import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import type { UiShop } from "@/services/mappers";
import { ProductThumb } from "./ProductThumb";
import { useUpdateShop } from "./model";
import {
  activeListingKeysForShop,
  type ShopListing,
} from "./shopListings";

/** Inline shop catalog editor — toggle product visibility per listing. */
export function CatalogEditor({
  shop,
  listings,
}: {
  shop: UiShop;
  listings: ShopListing[];
}) {
  const updateShop = useUpdateShop();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("All Products");
  const [search, setSearch] = useState("");
  const [viewSelected, setViewSelected] = useState(false);

  const listingKeys = useMemo(() => new Set(listings.map((l) => l.key)), [listings]);

  useEffect(() => {
    setPicked(new Set(activeListingKeysForShop(shop, listingKeys)));
  }, [shop.activeListingKeys, shop.selectedCatalogProductIds, listingKeys]);

  const categories = useMemo(() => {
    const set = new Set<string>(["All Products"]);
    listings.forEach((l) => set.add(l.category));
    return [...set];
  }, [listings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (viewSelected && !picked.has(l.key)) return false;
      if (category !== "All Products" && l.category !== category) return false;
      if (
        q &&
        !`${l.product.nm} ${l.product.brand || ""} ${l.collectionName}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [listings, picked, category, search, viewSelected]);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    const activeListingKeys = [...picked].filter((k) => listingKeys.has(k));
    const active = new Set(activeListingKeys);
    const featuredListingKeys = (shop.featuredListingKeys || [])
      .filter((k) => active.has(k))
      .slice(0, 5);
    try {
      await updateShop.mutateAsync({
        shopId: shop.id,
        input: { activeListingKeys, featuredListingKeys },
      });
      toast.success("Shop catalog updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update catalog");
    }
  }

  return (
    <div className="shop-catalog-editor">
      <div className="sm-catalog-modal-inner shop-catalog-editor-inner">
        <div className="sm-catalog-modal-head">
          <h3 className="shop-catalog-editor-title">Edit catalog</h3>
          <p className="muted sm-catalog-modal-sub">
            Hide or show products in <b>{shop.name}</b>. Deselected items will not appear on the
            live shop.
          </p>
          {picked.size === 0 ? (
            <div className="sm-catalog-modal-warn">
              No products selected. Enable some so recipients can shop them.
            </div>
          ) : null}
        </div>

        {listings.length === 0 ? (
          <div className="shop-catalog-editor-empty muted">
            Publish a collection in Branded Swag to manage product visibility here.
          </div>
        ) : (
          <>
            <div className="sm-catalog-modal-body shop-catalog-editor-body">
              <aside className="sm-catalog-modal-rail">
                {categories.map((c) => {
                  const entries = listings.filter((l) => c === "All Products" || l.category === c);
                  const sel = entries.filter((l) => picked.has(l.key)).length;
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`item ${category === c ? "on" : ""}`}
                      onClick={() => setCategory(c)}
                    >
                      <span className="item-label">{c}</span>
                      <span className="ct">
                        ({sel}/{entries.length})
                      </span>
                    </button>
                  );
                })}
              </aside>

              <div className="sm-catalog-modal-main">
                <div className="sm-catalog-modal-toolbar">
                  <div className="search sm-catalog-modal-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      aria-label="Search products"
                      placeholder="Search products"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="sm-catalog-modal-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>
                      Deselect all
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPicked(new Set(listings.map((l) => l.key)))}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className={`btn btn-ghost btn-sm ${viewSelected ? "on" : ""}`}
                      onClick={() => setViewSelected((v) => !v)}
                    >
                      {viewSelected ? "View all" : "View selected"}
                    </button>
                  </div>
                </div>

                <div className="sm-catalog-modal-grid shop-catalog-editor-grid">
                  {filtered.length === 0 ? (
                    <p className="muted" style={{ padding: "16px 0" }}>
                      No products match your filters.
                    </p>
                  ) : (
                    filtered.map((l) => {
                      const on = picked.has(l.key);
                      return (
                        <button
                          key={l.key}
                          type="button"
                          className={`pcard sm-catalog-product${on ? " on" : ""}`}
                          aria-pressed={on}
                          onClick={() => toggle(l.key)}
                        >
                          <div className={`sm-catalog-check${on ? " on" : ""}`}>{on ? "✓" : ""}</div>
                          <ProductThumb product={l.product} branded />
                          <div className="meta">
                            {l.product.brand ? <div className="brand">{l.product.brand}</div> : null}
                            <div className="nm">{l.product.nm}</div>
                            <div className="sm-catalog-collection-label">Collection</div>
                            <div className="sm-catalog-collection-name">{l.collectionName}</div>
                            <div className="pr">{l.product.price || l.category}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="sm-catalog-modal-footer">
              <span className="mut3">
                {picked.size} of {listings.length} selected
              </span>
              <button
                type="button"
                className="btn btn-brand"
                disabled={updateShop.isPending}
                onClick={save}
              >
                {updateShop.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
