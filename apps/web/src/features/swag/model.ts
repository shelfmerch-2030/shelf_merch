import { useMutation } from "@tanstack/react-query";
import {
  addProductToShopFlow,
  archiveCollectionFlow,
  createCollectionFlow,
  deleteCollectionFlow,
  restoreCollectionFlow,
  updateCollectionFlow,
  updateCollectionArtworkFlow,
} from "@/services/api-bridge";
import { apiFetch } from "@/services/api";
import { useInvalidateWorkspace } from "@/hooks/useWorkspace";
import type { MockupUploadItem } from "./mockup-bake";
import type { UiCollection, UiProduct } from "@/services/mappers";

// Ui types re-exported here so views/controllers never import services/ directly.
export type { UiCollection, UiProduct, UiShop } from "@/services/mappers";

export type CreateCollectionInput = {
  shopId?: string;
  name: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  preferredColors?: string[];
  artwork?: { file?: File; preview?: string; name?: string };
  mockups?: MockupUploadItem[];
};

export function useCreateCollection() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: CreateCollectionInput) => createCollectionFlow(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCollection() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (input: {
      collectionId: string;
      name: string;
      pickedIndices: number[];
      catalog: UiProduct[];
      artwork?: { file?: File; preview?: string; name?: string };
      mockups?: MockupUploadItem[];
    }) => updateCollectionFlow(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCollectionArtwork() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: updateCollectionArtworkFlow,
    onSuccess: () => invalidate(),
  });
}

export function useArchiveCollection() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (collectionId: string) => archiveCollectionFlow(collectionId),
    onSuccess: () => invalidate(),
  });
}

export function useRestoreCollection() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (collectionId: string) => restoreCollectionFlow(collectionId),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCollection() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (collectionId: string) => deleteCollectionFlow(collectionId),
    onSuccess: () => invalidate(),
  });
}

export function useAddProductToShop() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (payload: {
      shopId: string;
      collection: UiCollection;
      product: UiProduct;
      catalog: UiProduct[];
    }) => addProductToShopFlow(payload),
    onSuccess: () => invalidate(),
  });
}

export function useSyncCollectionPublish() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ collectionId, shopIds }: { collectionId: string; shopIds: string[] }) =>
      apiFetch<unknown>(`/collections/${collectionId}/publish`, {
        method: "POST",
        body: JSON.stringify({ shopIds }),
      }),
    onSuccess: () => invalidate(),
  });
}
