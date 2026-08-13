import { Link, useLocation } from "react-router";
import { ArrowLeft } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";
import type { CatalogProductVm } from "../controllers/useCatalogProductController";
import { ProductDetail } from "./ProductDetail";

/** Catalog product detail page: loading/error/not-found states + product detail. */
export function CatalogProductView(vm: CatalogProductVm) {
  const { pathname } = useLocation();
  const catalogHome = pathname.startsWith("/apps/catalog") ? "/apps/catalog" : "/app/catalog";

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
      <Link
        to={catalogHome}
        className="lnk"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14 }}
      >
        <ArrowLeft size={15} /> Back to catalog
      </Link>

      <div className="card" style={{ padding: 24 }}>
        <ProductDetail product={vm.product} index={vm.index} />
      </div>
    </>
  );
}
