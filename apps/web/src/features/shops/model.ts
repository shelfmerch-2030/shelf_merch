import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/services/api";
import { createShopFlow, updateShopFlow } from "@/services/api-bridge";
import { archiveShopApi, duplicateShopApi, publishShopApi } from "@/services/workspace-api";
import type { UiShop } from "@/services/mappers";
import { useInvalidateWorkspace } from "@/hooks/useWorkspace";

// Ui types re-exported here so views/controllers never import services/ directly.
export type { UiShop, UiCollection, UiProduct } from "@/services/mappers";

export type CreateShopInput = {
  name: string;
  currency: string;
  categories: string[];
  companyEmailDomain?: string;
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
};

export type UpdateShopInput = {
  name?: string;
  currencyMode?: "points" | "inr";
  pointsConversionEnabled?: boolean;
  companyEmailDomain?: string;
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
  categories?: string[];
  selectedCatalogProductIds?: string[];
  featuredCatalogProductIds?: string[];
  activeListingKeys?: string[];
  featuredListingKeys?: string[];
};

export type ShopReport = {
  shopId: string;
  shopName: string;
  generatedAt: string;
  totals: {
    campaignsLaunched: number;
    recipients: number;
    pointsIssuedInr: number;
    pointsRedeemedInr: number;
    redemptionRate: number;
    ordersCount: number;
    orderValueInr: number;
    avgOrderValueInr: number;
  };
  funnel: Array<{ stage: string; label: string; count: number; pct: number }>;
  weekly: Array<{ weekStart: string; orders: number; valueInr: number }>;
  topProducts: Array<{ name: string; qty: number; valueInr: number }>;
};

/** Aggregated shop performance for the Reports tab. */
export function useShopReport(shopId: string | undefined) {
  return useQuery({
    queryKey: ["shop-report", shopId],
    queryFn: () => apiFetch<ShopReport>(`/shops/${shopId}/report`),
    enabled: Boolean(shopId),
    staleTime: 60_000,
  });
}

export function useCreateShop() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: CreateShopInput) => createShopFlow(input),
    onSuccess: () => invalidate(),
  });
}

export function usePublishShop() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (shopId: string) => publishShopApi(shopId),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateShop() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ shopId, input }: { shopId: string; input: UpdateShopInput }) =>
      updateShopFlow(shopId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDuplicateShop() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (shop: UiShop) => duplicateShopApi(shop),
    onSuccess: () => invalidate(),
  });
}

export function useArchiveShop() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (shopId: string) => archiveShopApi(shopId),
    onSuccess: () => invalidate(),
  });
}

export function useUnpublishCollectionFromShop() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ collectionId, shopId }: { collectionId: string; shopId: string }) =>
      apiFetch<unknown>(`/collections/${collectionId}/unpublish`, {
        method: "POST",
        body: JSON.stringify({ shopId }),
      }),
    onSuccess: () => invalidate(),
  });
}
