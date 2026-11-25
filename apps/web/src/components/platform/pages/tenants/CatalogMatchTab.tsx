import { useCallback, useMemo } from "react";
import { CatalogMatchPanel } from "@/features/catalog-match/CatalogMatchPanel";
import { getStoredUser } from "@/services/auth-store";
import { platformCatalogMatch } from "@/services/catalog-match-api";
import { canAccessArea } from "@/services/platform-access";
import { apiFetch } from "@/services/api";
import type { PlatformProductListItem } from "@/services/platform-api";

/**
 * Ops view of bulk catalog matching for one tenant. Mappings created here are tenant-wide (used by the public
 * Orders API); runs read from a client API connection are scoped to that connection.
 */
export function CatalogMatchTab({ tenantId }: { tenantId: string }) {
  const role = getStoredUser()?.role;
  const canWrite = canAccessArea(role, "orders", "write");
  const client = useMemo(() => platformCatalogMatch(tenantId), [tenantId]);
  const searchProducts = useCallback(
    async (search: string) => {
      // One page is enough for a typeahead.
      const q = new URLSearchParams({ search, status: "active", limit: "20", page: "1" });
      const res = await apiFetch<{ items: PlatformProductListItem[] }>(`/platform/products?${q.toString()}`);
      return (res.items ?? []).map((p) => ({ _id: p._id, name: p.name, sku: p.sku }));
    },
    [],
  );

  if (!canAccessArea(role, "orders", "read")) {
    return <p className="muted">You need access to Orders to manage catalog matching.</p>;
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        Match this tenant's catalog to ShelfMerch products. Confident matches (90%+, with the size/colour available) are
        mapped automatically; the rest wait for review. The tenant's company admins can do the same under Settings →
        Developers. Existing mappings are never overwritten.
      </p>
      <CatalogMatchPanel client={client} searchProducts={searchProducts} allowApiSource canWrite={canWrite} />
    </div>
  );
}
