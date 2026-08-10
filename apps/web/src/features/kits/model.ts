import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createKitFlow,
  ensureCuratedKitFlow,
  launchKitCampaignFlow,
  refreshPlatformKits,
  updateKitFlow,
  uploadKitArtworkFlow,
  type PlatformKitTemplate,
} from "@/services/api-bridge";
import { useInvalidateWorkspace } from "@/hooks/useWorkspace";
import type { MockupUploadItem } from "@/features/swag/mockup-bake";
import type { UiProduct } from "@/services/mappers";

// Ui + service types re-exported here so views/controllers never import services/ directly.
export type { UiKit, UiProduct } from "@/services/mappers";
export type { PlatformKitTemplate } from "@/services/api-bridge";

export const PLATFORM_KITS_QUERY_KEY = ["platform-kits"] as const;

/** Platform-curated kit templates shown in the "Pre-designed kits" section. */
export function usePlatformKits() {
  return useQuery<PlatformKitTemplate[]>({
    queryKey: PLATFORM_KITS_QUERY_KEY,
    queryFn: refreshPlatformKits,
    staleTime: 60_000,
  });
}

export type KitArtworkInput = { file?: File; preview?: string; name?: string };

export type CreateKitInput = {
  name: string;
  description?: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging: string;
  designNotes?: string;
  kitPrice?: number;
  artwork?: KitArtworkInput;
  mockups?: MockupUploadItem[];
};

export function useCreateKit() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: CreateKitInput) => createKitFlow(input),
    onSuccess: () => invalidate(),
  });
}

/** Clone/reuse a curated platform kit for send (campaignOps write — entity_manager OK). */
export function useEnsureCuratedKit() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: {
      platformKitId: string;
      productRefs?: Array<{
        catalogProductId: string;
        brand?: string;
        name: string;
        group?: string;
      }>;
    }) => ensureCuratedKitFlow(input.platformKitId, input.productRefs),
    onSuccess: () => invalidate(),
  });
}

export type UpdateKitInput = {
  id: string;
  name?: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging?: string;
  designNotes?: string;
  artwork?: KitArtworkInput;
  status?: string;
};

export function useUpdateKit() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: UpdateKitInput) => updateKitFlow(input),
    onSuccess: () => invalidate(),
  });
}

/** Artwork-only upload (safe for campaignOps / curated send). */
export function useUploadKitArtwork() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: { kitId: string; artwork: KitArtworkInput }) =>
      uploadKitArtworkFlow(input.kitId, input.artwork),
    onSuccess: () => invalidate(),
  });
}

export type LaunchKitCampaignInput = Parameters<typeof launchKitCampaignFlow>[0];

export function useLaunchKitCampaign() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: LaunchKitCampaignInput) => launchKitCampaignFlow(input),
    onSuccess: () => invalidate(),
  });
}
