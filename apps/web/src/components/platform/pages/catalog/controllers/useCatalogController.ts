import { useState } from "react";
import { getStoredUser } from "@/services/auth-store";
import { canAccessArea } from "@/services/platform-access";
import { moveProductToKit } from "@/services/platform-api";
import { usePlatformProducts } from "../model";
import { downloadCatalogCsv } from "../catalogCsv";

export type CatalogStatusFilter = "all" | "draft" | "active" | "archived" | "discontinued";
export type CatalogSort =
  | "newest"
  | "name"
  | "price-asc"
  | "price-desc"
  | "margin"
  | "stock";

type CatalogRow = {
  _id: string;
  name: string;
  sku: string;
  status: string;
  sellingPriceInr: number;
  costPriceInr: number;
  marginPct: number;
  inventory?: { available?: number };
  createdAt?: string;
};

export type CatalogVm = ReturnType<typeof usePlatformProducts> & {
  canWrite: boolean;
  search: string;
  onSearch: (value: string) => void;
  statusFilter: CatalogStatusFilter;
  onStatusFilter: (value: CatalogStatusFilter) => void;
  sort: CatalogSort;
  onSort: (value: CatalogSort) => void;
  rows: CatalogRow[];
  movingId: string | null;
  moveError: string;
  onAddToKits: (productId: string) => Promise<void>;
  exportError: string;
  onExport: () => void;
};

function stockOf(row: CatalogRow) {
  return row.inventory?.available ?? 0;
}

function applyCatalogQuery(
  items: CatalogRow[],
  search: string,
  statusFilter: CatalogStatusFilter,
  sort: CatalogSort,
): CatalogRow[] {
  const q = search.trim().toLowerCase();
  let list = items.filter((row) => {
    // "All" = live catalog (exclude archived / moved-to-kits rows).
    if (statusFilter === "all") {
      if (row.status === "archived") return false;
    } else if (row.status !== statusFilter) {
      return false;
    }
    if (!q) return true;
    return row.name.toLowerCase().includes(q) || row.sku.toLowerCase().includes(q);
  });

  list = [...list];
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "price-asc") list.sort((a, b) => a.sellingPriceInr - b.sellingPriceInr);
  else if (sort === "price-desc") list.sort((a, b) => b.sellingPriceInr - a.sellingPriceInr);
  else if (sort === "margin") list.sort((a, b) => b.marginPct - a.marginPct);
  else if (sort === "stock") list.sort((a, b) => stockOf(b) - stockOf(a));
  else {
    list.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }
  return list;
}

/** Controller for the platform catalog list. */
export function useCatalogController(): CatalogVm {
  const [reloadKey, setReloadKey] = useState(0);
  const load = usePlatformProducts(reloadKey);
  const canWrite = canAccessArea(getStoredUser()?.role, "catalog", "write");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CatalogStatusFilter>("all");
  const [sort, setSort] = useState<CatalogSort>("newest");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState("");
  const [exportError, setExportError] = useState("");

  const rows = load.data
    ? applyCatalogQuery(load.data.items as CatalogRow[], search, statusFilter, sort)
    : [];

  async function onAddToKits(productId: string) {
    setMoveError("");
    setMovingId(productId);
    try {
      await moveProductToKit(productId);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Failed to move product to kits");
    } finally {
      setMovingId(null);
    }
  }

  function onExport() {
    if (load.loading || load.error || !load.data?.items.length) return;
    setExportError("");
    try {
      if (load.data.items.length < load.data.total) {
        throw new Error("The full catalog could not be loaded. Reload the page before exporting.");
      }
      downloadCatalogCsv(load.data.items);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Failed to export catalog");
    }
  }

  return {
    ...load,
    canWrite,
    search,
    onSearch: setSearch,
    statusFilter,
    onStatusFilter: setStatusFilter,
    sort,
    onSort: setSort,
    rows,
    movingId,
    moveError,
    onAddToKits,
    exportError,
    onExport,
  };
}
