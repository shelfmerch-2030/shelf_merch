import { Link, useLocation } from "react-router";
import { ArrowLeft } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import type { CatalogProductVm } from "../controllers/useCatalogProductController";
import { ProductDetail } from "./ProductDetail";
import { ProductCard } from "./ProductCard";

/** Catalog product detail page: loading/error/not-found states + product detail. */
export function CatalogProductView(vm: CatalogProductVm) {
  const location = useLocation();
  const { pathname } = location;
  const catalogHome = pathname.startsWith("/apps/catalog") ? "/apps/catalog" : "/app/catalog";
  const backTarget =
    typeof location.state === "object" &&
    location.state &&
    "fromCatalog" in location.state &&
    typeof location.state.fromCatalog === "string"
      ? location.state.fromCatalog
      : catalogHome;

  if (vm.isLoading) {
    return <LoadingState message="Loading product…" fullScreen={false} />;
  }

  if (vm.errorMessage) {
    return (
      <div className="card" style={{ padding: 16, color: "var(--danger)" }}>
        {vm.errorMessage}
      </div>
    );
  }

  if (!vm.product) {
    return (
      <div className="card empty" style={{ padding: 48 }}>
        <h3>Product not found</h3>
        <p>This product may have been removed from the catalog.</p>
        <Link to={catalogHome} className="btn btn-soft" style={{ marginTop: 14 }}>
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link to={backTarget} className="catalog-pdp-back-link">
        <ArrowLeft size={15} /> Back to catalog
      </Link>

      <div className="catalog-pdp-card">
        <ProductDetail product={vm.product} index={vm.index} />
      </div>

      <ProductRecommendations
        items={vm.suggestions}
        catalogHome={catalogHome}
        backTarget={backTarget}
      />
    </>
  );
}

function ProductRecommendations({
  items,
  catalogHome,
  backTarget,
}: {
  items: CatalogProductVm["suggestions"];
  catalogHome: string;
  backTarget: string;
}) {
  if (!items.length) return null;

  return (
    <section className="catalog-pdp-recs" aria-labelledby="catalog-pdp-recs-title">
      <div className="catalog-pdp-recs__inner">
        <div className="catalog-pdp-recs__heading">
          <span aria-hidden="true" />
          <h2 id="catalog-pdp-recs-title">You might also like</h2>
          <span aria-hidden="true" />
        </div>

        <div className="catalog-pdp-recs__grid">
          {items.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              to={`${catalogHome}/${item.id}`}
              state={{ fromCatalog: backTarget }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
