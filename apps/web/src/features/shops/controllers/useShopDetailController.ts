import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { useWorkspace } from "@/hooks/useWorkspace";
import { collectionLinkedToShop, SHOP_TABS, shopTabFromSearch, type ShopTab } from "../types";
import { publishedShopListings } from "../shopListings";
import {
  clearShopCelebration,
  peekShopCelebration,
} from "../shopCelebration";
import type { UiCollection, UiProduct, UiShop } from "../model";
import { shopStorefrontHref } from "@/lib/shopRedeemUrl";

const MANAGER_TABS: ShopTab[] = ["Branded Swag", "Shop Catalog", "Sent Gifts", "Reports"];

export type ShopDetailVm = {
  isLoading: boolean;
  errorMessage: string | null;
  shop: UiShop | null;
  collections: UiCollection[];
  catalogProducts: UiProduct[];
  shopListings: ReturnType<typeof publishedShopListings>;
  tab: ShopTab;
  visibleTabs: ShopTab[];
  canEditShop: boolean;
  canDesignSwag: boolean;
  canSendPoints: boolean;
  showWelcome: boolean;
  welcomeShopName: string;
  onDismissWelcome: () => void;
  onSelectTab: (tab: ShopTab) => void;
  onSendPoints: (campaignId?: string) => void;
  onStartDesigning: () => void;
  onViewLiveShop: () => void;
  onPublishShop: () => void;
};

/** Controller for the shop detail page: route param, tab state (URL-synced), navigation. */
export function useShopDetailController(): ShopDetailVm {
  const { id } = useParams() as { id: string };
  const [searchParams, setSearchParams] = useSearchParams();
  const tabSearch = searchParams.get("tab") ?? undefined;
  const welcomeParam = searchParams.get("welcome") === "1";
  const navigate = useNavigate();
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const { canWrite, canOperateCampaigns } = useTenantAccess();
  const canEditShop = canWrite("shops");
  const canDesignSwag = canWrite("swag");
  const canSendPoints = canOperateCampaigns();
  const visibleTabs = canEditShop ? [...SHOP_TABS] : MANAGER_TABS;

  const celebration = peekShopCelebration(id);
  const [showWelcome, setShowWelcome] = useState(
    () => welcomeParam || Boolean(celebration),
  );
  const [welcomeShopName] = useState(
    () => celebration?.shopName || "",
  );

  const [tab, setTab] = useState<ShopTab>(() => {
    const fromSearch = shopTabFromSearch(tabSearch);
    if (fromSearch && (canEditShop || MANAGER_TABS.includes(fromSearch))) return fromSearch;
    return "Branded Swag";
  });

  const shop = workspace?.shops.find((s) => s.id === id) ?? null;
  const collections = useMemo(
    () =>
      shop ? (workspace?.collections ?? []).filter((c) => collectionLinkedToShop(c, shop.id)) : [],
    [workspace?.collections, shop],
  );
  const shopListings = useMemo(
    () =>
      shop
        ? publishedShopListings(
            (workspace?.collections ?? []).filter((c) => collectionLinkedToShop(c, shop.id)),
            workspace?.catalogProducts ?? [],
          )
        : [],
    [workspace?.collections, workspace?.catalogProducts, shop],
  );

  useEffect(() => {
    if (!welcomeParam) return;
    const next = new URLSearchParams(searchParams);
    next.delete("welcome");
    setSearchParams(next, { replace: true });
  }, [welcomeParam, searchParams, setSearchParams]);

  useEffect(() => {
    const fromSearch = shopTabFromSearch(tabSearch);
    if (fromSearch && visibleTabs.includes(fromSearch)) setTab(fromSearch);
  }, [tabSearch, visibleTabs]);

  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab(visibleTabs[0] ?? "Branded Swag");
  }, [tab, visibleTabs]);

  function dismissWelcome() {
    setShowWelcome(false);
    clearShopCelebration();
  }

  function onSelectTab(next: ShopTab) {
    setTab(next);
    const slug = next.toLowerCase().replace(/\s+/g, "-");
    void navigate(`/app/shops/${id}?tab=${encodeURIComponent(slug)}`, { replace: true });
  }

  function onSendPoints(campaignId?: string) {
    if (!shop || !canSendPoints) return;
    const params = new URLSearchParams({ shop: shop.id });
    if (campaignId) params.set("campaign", campaignId);
    navigate(`/app/campaigns/send-points?${params}`);
  }

  return {
    isLoading: isLoading && !workspace,
    errorMessage:
      isError || !workspace
        ? error instanceof Error
          ? error.message
          : "Could not load shop"
        : null,
    shop,
    collections,
    catalogProducts: workspace?.catalogProducts ?? [],
    shopListings,
    tab,
    visibleTabs,
    canEditShop,
    canDesignSwag,
    canSendPoints,
    showWelcome,
    welcomeShopName: welcomeShopName || shop?.name || "your shop",
    onDismissWelcome: dismissWelcome,
    onSelectTab,
    onSendPoints,
    onStartDesigning: () =>
      canDesignSwag && shop && navigate(`/app/swag/new?shop=${encodeURIComponent(shop.id)}`),
    onViewLiveShop: () => {
      if (!shop) return;
      window.open(shopStorefrontHref(shop), "_blank", "noopener");
    },
    onPublishShop: () => {
      if (!shop || !canEditShop || shop.live) return;
      navigate(`/app/shops/${shop.id}/publish`);
    },
  };
}
