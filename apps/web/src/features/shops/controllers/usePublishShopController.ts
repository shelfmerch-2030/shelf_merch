import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useInvalidateWorkspace, useWorkspace } from "@/hooks/useWorkspace";
import { bannerConfigFromSource } from "../banner";
import { usePublishShop, useUpdateShop } from "../model";
import { markShopCelebration } from "../shopCelebration";
import {
  INITIAL_SHOP_DRAFT,
  shopDraftFromShop,
  shopDraftReducer,
  type ShopDraft,
  type ShopDraftAction,
} from "../shopDraft";

export type PublishShopVm = {
  isLoading: boolean;
  errorMessage: string | null;
  shopMissing: boolean;
  ready: boolean;
  draft: ShopDraft;
  dispatch: Dispatch<ShopDraftAction>;
  publishing: boolean;
  onExit: () => void;
  onPublish: () => void;
};

/** Controller for publishing a draft shop: hydrate builder draft, save look, then go live. */
export function usePublishShopController(): PublishShopVm {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const updateShop = useUpdateShop();
  const publishShop = usePublishShop();
  const invalidateWorkspace = useInvalidateWorkspace();
  const [draft, dispatch] = useReducer(shopDraftReducer, INITIAL_SHOP_DRAFT);
  const [ready, setReady] = useState(false);
  const hydratedIdRef = useRef<string | null>(null);

  const shop = workspace?.shops.find((s) => s.id === id) ?? null;

  useEffect(() => {
    if (isLoading) return;
    if (!shop) {
      hydratedIdRef.current = null;
      setReady(false);
      return;
    }
    if (shop.live) {
      navigate(`/app/shops/${shop.id}`, { replace: true });
      return;
    }
    if (hydratedIdRef.current === shop.id) return;
    hydratedIdRef.current = shop.id;
    dispatch({ type: "set", patch: { ...shopDraftFromShop(shop), step: 2 } });
    setReady(true);
  }, [shop, isLoading, navigate]);

  async function onPublish() {
    if (!shop) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error("Enter a shop name");
      return;
    }
    try {
      await updateShop.mutateAsync({
        shopId: shop.id,
        input: {
          name,
          companyEmailDomain: draft.companyEmailDomain.trim().replace(/^@/, "").toLowerCase(),
          logoUrl: draft.logoUrl,
          bannerConfig: bannerConfigFromSource({
            bannerTheme: draft.bannerTheme,
            bannerPreset: draft.bannerPreset,
            bannerImageUrl: draft.bannerImageUrl,
          }),
          categories: draft.categories,
        },
      });
      await publishShop.mutateAsync(shop.id);

      markShopCelebration({ shopId: shop.id, shopName: name });
      toast.success(`"${name}" is live! 🎉`);

      await invalidateWorkspace();
      navigate(`/app/shops/${shop.id}?welcome=1`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish shop");
    }
  }

  return {
    isLoading,
    errorMessage: isError ? (error instanceof Error ? error.message : "Failed to load shop") : null,
    shopMissing: !isLoading && !isError && !shop,
    ready,
    draft,
    dispatch,
    publishing: updateShop.isPending || publishShop.isPending,
    onExit: () => navigate(shop ? `/app/shops/${shop.id}` : "/app/shops"),
    onPublish,
  };
}
