import { useQuery } from "@tanstack/react-query";
import {
  fetchCatalogProduct,
  refreshCatalogKitsPublic,
  refreshCatalogProducts,
  type CatalogProductsResult,
} from "@/services/api-bridge";
import type { WorkspaceSnapshot } from "@/services/workspace-api";
import { ALL_PRODUCTS, KITS_CATEGORY } from "./types";

// Ui types re-exported here so views/controllers never import services/ directly.
export type { UiProduct } from "@/services/mappers";
export type { CatalogProductsResult } from "@/services/api-bridge";

export const CATALOG_QUERY_KEY = "catalog";
export const CATALOG_KITS_QUERY_KEY = [CATALOG_QUERY_KEY, "kits"] as const;

/**
 * Catalog products for a category. Mirrors the legacy server-side filtering
 * (`refreshCatalogProducts`), cached per category. The "All Products" tab is
 * seeded from the workspace snapshot to avoid a load flash on first paint.
 */
export function useCatalog(
  category: string,
  seed?: CatalogProductsResult,
  enabled: boolean = true,
) {
  const isKitsCategory = category === KITS_CATEGORY;
  return useQuery({
    queryKey: [CATALOG_QUERY_KEY, category],
    queryFn: () => refreshCatalogProducts(category === ALL_PRODUCTS ? undefined : category),
    initialData: enabled && category === ALL_PRODUCTS ? seed : undefined,
    staleTime: 30_000,
    enabled: enabled && !isKitsCategory,
  });
}

/** Platform-curated kits for the catalog Kits category (public browse). */
export function useCatalogKits(enabled: boolean = true) {
  return useQuery({
    queryKey: CATALOG_KITS_QUERY_KEY,
    queryFn: refreshCatalogKitsPublic,
    staleTime: 60_000,
    enabled,
  });
}

export function useCatalogProduct(id: string, workspace?: WorkspaceSnapshot) {
  const fromWorkspace = workspace?.catalogProducts.find((p) => p.id === id);

  return useQuery({
    queryKey: [CATALOG_QUERY_KEY, "product", id],
    queryFn: () => fetchCatalogProduct(id),
    initialData: fromWorkspace,
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
