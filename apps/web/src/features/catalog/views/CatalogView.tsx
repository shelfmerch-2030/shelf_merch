import { useLocation } from "react-router";
import { PageHeader } from "@/components/tenant/PageHeader";
import type { CatalogVm } from "../controllers/useCatalogController";
import { ProductCard } from "./ProductCard";

const GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
  gap: 16,
} as const;

function CatalogSkeleton() {
  return (
    <div className="sm-skeleton-grid" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="sm-skeleton-card">
          <div className="sm-skeleton-img" />
          <div className="sm-skeleton-line" />
          <div className="sm-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

/** Catalog grid: category tabs + product cards (loading/error/empty states). */
export function CatalogView(vm: CatalogVm) {
  const { pathname } = useLocation();
  const productBase = pathname.startsWith("/apps/catalog") ? "/apps/catalog" : "/app/catalog";

  return (
    <>
      <PageHeader
        title="Catalog"
        subtitle={`${vm.count} products from vetted suppliers, ready to brand and ship across India.`}
      />

      <div
        className="tabs"
        style={{ marginBottom: 20 }}
        role="tablist"
        aria-label="Product categories"
      >
        {vm.categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={c === vm.category}
            className={c === vm.category ? "on" : ""}
            onClick={() => vm.onCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {vm.isSkeleton ? (
        <CatalogSkeleton />
      ) : vm.errorMessage ? (
        <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
          {vm.errorMessage}
        </div>
      ) : vm.items.length === 0 ? (
        <div className="card empty" style={{ padding: 48, textAlign: "center" }}>
          <h3>No products in this category</h3>
          <p className="muted">Try another category.</p>
        </div>
      ) : (
        <div style={GRID_STYLE}>
          {vm.items.map((p, index) => (
            <ProductCard
              key={p.id ?? `${p.nm}-${index}`}
              product={p}
              to={p.id ? `${productBase}/${p.id}` : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}
