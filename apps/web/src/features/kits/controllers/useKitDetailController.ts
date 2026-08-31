import { useMemo } from "react";
import { useParams } from "react-router";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { useWorkspace } from "@/hooks/useWorkspace";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { curatedIncludedItems } from "../KitPreviewDialog";
import {
  curatedKitHasBrandLogo,
  getCuratedKitMeta,
} from "./useSendKitController";
import { usePlatformKits, type UiKit, type UiProduct } from "../model";

export type KitDetailProduct = {
  name: string;
  brand?: string;
  imageUrl?: string;
  /** Catalog product — only for customised kits that use DesignedProductThumb. */
  img?: UiProduct;
};

export type KitDetailVm = {
  isLoading: boolean;
  errorMessage: string | null;
  kit: UiKit | undefined;
  products: KitDetailProduct[];
  /** Curated kits: true when sender has uploaded a brand logo. */
  isCuratedKit: boolean;
  logoUrl: string | null;
  hasUploadedLogo: boolean;
  canEditKit: boolean;
  canSendKit: boolean;
};

/** Controller for the kit detail page: route param, kit lookup, product refs. */
export function useKitDetailController(): KitDetailVm {
  const { id } = useParams() as { id: string };
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const { data: platformKits } = usePlatformKits();
  const { canWrite, canOperateCampaigns } = useTenantAccess();
  const kit = workspace?.kits.find((k) => k.id === id);
  const curatedMeta = getCuratedKitMeta(kit);
  const isCuratedKit = !!curatedMeta;

  const products = useMemo<KitDetailProduct[]>(() => {
    if (!kit) return [];

    if (curatedMeta) {
      return curatedIncludedItems(
        curatedMeta,
        platformKits,
        kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) : undefined,
      ).map((item) => ({
        name: item.label,
        imageUrl: item.imageUrl,
      }));
    }

    if (!kit.productRefs?.length) return [];
    const byId = new Map((workspace?.catalogProducts ?? []).map((p) => [p.id, p]));
    return kit.productRefs.map((ref) => ({
      name: ref.name,
      brand: ref.brand,
      img: byId.get(ref.catalogProductId),
      imageUrl: (() => {
        const product = byId.get(ref.catalogProductId);
        if (!product) return undefined;
        return (
          resolveMediaUrl(product.mockupUrl) ||
          resolveMediaUrl(product.imgUrl) ||
          undefined
        );
      })(),
    }));
  }, [kit, curatedMeta, platformKits, workspace?.catalogProducts]);

  const hasUploadedLogo = curatedKitHasBrandLogo(kit);
  const logoUrl = useMemo(() => {
    if (!kit || !isCuratedKit) return null;
    if (!hasUploadedLogo) return null;
    const fromMeta = curatedMeta?.brandLogoUrl
      ? resolveMediaUrl(curatedMeta.brandLogoUrl) || curatedMeta.brandLogoUrl
      : "";
    const fromKit = kit.artworkUrl ? resolveMediaUrl(kit.artworkUrl) || kit.artworkUrl : "";
    return fromMeta || fromKit || null;
  }, [kit, isCuratedKit, hasUploadedLogo, curatedMeta]);

  return {
    isLoading: isLoading && !workspace,
    errorMessage:
      isError || !workspace
        ? error instanceof Error
          ? error.message
          : "Could not load kit"
        : null,
    kit,
    products,
    isCuratedKit,
    logoUrl,
    hasUploadedLogo,
    canEditKit: canWrite("kits"),
    canSendKit: canOperateCampaigns(),
  };
}
