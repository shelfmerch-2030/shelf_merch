import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTenantAccess } from "@/hooks/useTenantAccess";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useEnsureCuratedKit,
  type PlatformKitTemplate,
} from "@/features/kits/model";
import {
  buildKitPreviewFromPlatform,
  buildKitPreviewFromWorkspace,
  type KitPreviewData,
} from "@/features/kits/KitPreviewDialog";
import {
  gateWalletForCuratedKitSend,
  insufficientFundsMessage,
} from "@/features/kits/curatedKitWalletGate";
import { useStartSampleOrder } from "@/features/kits/sample/useStartSampleOrder";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import type { UiKit } from "@/services/mappers";
import {
  CUSTOMISED_KITS_SUBCATEGORY,
  PREDESIGNED_KITS_SUBCATEGORY,
} from "../types";
import { useCatalogKits } from "../model";
import noKitsYetImg from "../../../../assets/no-kits-yet.png";
import kitPreviewImg from "../../../../assets/kit-preview.png";

export type CatalogKitCard = {
  id: string;
  name: string;
  subtitle: string;
  image: string;
  kind: "pre-designed" | "customised";
  pricePerKitInr?: number;
  platformKit?: PlatformKitTemplate;
  workspaceKit?: UiKit;
};

export type CatalogKitsVm = {
  isLoading: boolean;
  errorMessage: string | null;
  kits: CatalogKitCard[];
  allKits: CatalogKitCard[];
  count: number;
  canSendKits: boolean;
  kitPreview: KitPreviewData | null;
  onPreviewOpenChange: (open: boolean) => void;
  onPreview: (kit: CatalogKitCard) => void;
  onSend: (kit: CatalogKitCard) => void;
  onRequestSample: (kit: CatalogKitCard) => void;
  sendPending: boolean;
  samplePending: boolean;
  suppressEmptyState?: boolean;
};

function templateImage(kit: PlatformKitTemplate): string {
  if (kit.heroImage) return resolveMediaUrl(kit.heroImage) || noKitsYetImg;
  return resolveMediaUrl(kit.imageUrls?.[0]) || noKitsYetImg;
}

function templateItemLabel(kit: PlatformKitTemplate): string {
  const itemCount =
    (Array.isArray(kit.itemImages) && kit.itemImages.length) ||
    kit.items?.length ||
    0;
  return itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "Curated bundle";
}

function customisedKitImage(kit: UiKit): string {
  if (kit.artworkUrl) return resolveMediaUrl(kit.artworkUrl) || kitPreviewImg;
  return kitPreviewImg;
}

function isCuratedWorkspaceKit(kit: UiKit): boolean {
  try {
    if (!kit.designNotes) return false;
    const parsed = JSON.parse(kit.designNotes);
    return Boolean(parsed?.curated);
  } catch {
    return false;
  }
}

function curatedPricePerKit(kit: PlatformKitTemplate): number {
  return Math.max(0, Math.round(Number(kit.approxValueInr) || 0));
}

function customisedKitPrice(kit: UiKit): number | undefined {
  const price = Math.max(0, Math.round(Number(kit.kitPrice) || 0));
  return price > 0 ? price : undefined;
}

function buildProductRefs(
  kit: PlatformKitTemplate,
  catalogProducts: Array<{
    id?: string;
    brand?: string;
    nm?: string;
    g?: string;
    category?: string;
  }>,
) {
  const productRefs: Array<{
    catalogProductId: string;
    brand?: string;
    name: string;
    group?: string;
  }> = [];

  for (const item of kit.items || []) {
    const pid = String(item.catalogProductId ?? "");
    if (!pid) continue;
    const product = catalogProducts.find((p) => p.id === pid);
    if (!product?.id) continue;
    if (productRefs.some((r) => r.catalogProductId === product.id)) continue;
    productRefs.push({
      catalogProductId: product.id,
      brand: product.brand || "",
      name: product.nm || "Product",
      group: product.g || product.category || "",
    });
  }

  return productRefs;
}

/** Controller for the catalog Kits category: pre-designed + customised kits. */
export function useCatalogKitsController(
  selectedSubcategory: string | null,
): CatalogKitsVm {
  const navigate = useNavigate();
  const { data: platformKits, isLoading, isError, error } = useCatalogKits();
  const { canSendKits } = useTenantAccess();
  const { data: workspace } = useWorkspace();
  const ensureCuratedKit = useEnsureCuratedKit();
  const sampleOrder = useStartSampleOrder();
  const [kitPreview, setKitPreview] = useState<KitPreviewData | null>(null);

  const catalog = workspace?.catalogProducts ?? [];

  const allKits = useMemo<CatalogKitCard[]>(() => {
    const preDesigned: CatalogKitCard[] = (platformKits ?? []).map((kit) => {
      const pricePerKitInr = curatedPricePerKit(kit);
      return {
        id: kit._id,
        name: kit.name,
        subtitle: templateItemLabel(kit),
        image: templateImage(kit),
        kind: "pre-designed",
        pricePerKitInr: pricePerKitInr > 0 ? pricePerKitInr : undefined,
        platformKit: kit,
      };
    });

    const customised: CatalogKitCard[] = (workspace?.kits ?? [])
      .filter((kit) => kit.status === "live" && !isCuratedWorkspaceKit(kit))
      .map((kit) => ({
        id: kit.id,
        name: kit.name,
        subtitle: kit.items ? `${kit.items} item${kit.items === 1 ? "" : "s"}` : "Custom kit",
        image: customisedKitImage(kit),
        kind: "customised",
        pricePerKitInr: customisedKitPrice(kit),
        workspaceKit: kit,
      }));

    return [...preDesigned, ...customised];
  }, [platformKits, workspace?.kits]);

  const kits = useMemo(() => {
    if (!selectedSubcategory) return allKits;
    if (selectedSubcategory === PREDESIGNED_KITS_SUBCATEGORY) {
      return allKits.filter((kit) => kit.kind === "pre-designed");
    }
    if (selectedSubcategory === CUSTOMISED_KITS_SUBCATEGORY) {
      return allKits.filter((kit) => kit.kind === "customised");
    }
    return allKits;
  }, [allKits, selectedSubcategory]);

  const onPreview = useCallback(
    (kit: CatalogKitCard) => {
      if (kit.platformKit) {
        setKitPreview(buildKitPreviewFromPlatform(kit.platformKit, catalog, kit.image));
        return;
      }
      if (kit.workspaceKit) {
        setKitPreview(
          buildKitPreviewFromWorkspace(kit.workspaceKit, catalog, kit.image, platformKits),
        );
        return;
      }
      setKitPreview({
        name: kit.name,
        description: "No description available.",
        coverImage: kit.image,
        products: [],
      });
    },
    [catalog, platformKits],
  );

  const onSend = useCallback(
    async (kit: CatalogKitCard) => {
      if (kit.workspaceKit?.id) {
        navigate(`/app/kits/${kit.workspaceKit.id}/send`);
        return;
      }

      const platformKit = kit.platformKit;
      if (!platformKit) return;

      if (!workspace) {
        toast.error("Workspace is still loading — try again in a moment.");
        return;
      }

      const gate = gateWalletForCuratedKitSend(workspace, curatedPricePerKit(platformKit));
      if (!gate.allowed) {
        if (gate.reason === "no_wallet") {
          navigate("/app/wallets", { state: { startCreateWallet: true } });
          return;
        }
        if (gate.reason === "pending_approval") {
          toast.message("Your wallet is under review. Once approved, you'll be able to send kits.");
          return;
        }
        toast.error(
          insufficientFundsMessage(gate.available, gate.required, gate.currency),
        );
        return;
      }

      const productRefs = buildProductRefs(platformKit, catalog);
      try {
        const ensured = await ensureCuratedKit.mutateAsync({
          platformKitId: platformKit._id,
          productRefs: productRefs.length ? productRefs : undefined,
        });
        navigate(`/app/kits/${ensured.id}/send`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to prepare curated kit for send");
      }
    },
    [workspace, catalog, ensureCuratedKit, navigate],
  );

  const onRequestSample = useCallback(
    async (kit: CatalogKitCard) => {
      if (kit.workspaceKit) {
        sampleOrder.startFromWorkspaceKit(kit.workspaceKit);
        return;
      }
      if (kit.platformKit) {
        await sampleOrder.startFromPlatformKit(kit.platformKit);
      }
    },
    [sampleOrder],
  );

  return {
    isLoading,
    errorMessage: isError
      ? error instanceof Error
        ? error.message
        : "Could not load kits"
      : null,
    kits,
    allKits,
    count: kits.length,
    canSendKits: canSendKits(),
    kitPreview,
    onPreviewOpenChange: (open) => {
      if (!open) setKitPreview(null);
    },
    onPreview,
    onSend,
    onRequestSample,
    sendPending: ensureCuratedKit.isPending,
    samplePending: sampleOrder.pending,
  };
}
