import { apiFetch } from "@/services/api";
import type { CopilotConfirmationArtifact } from "./api";
export type SwagStep = "name" | "products" | "artwork" | "design" | "stores" | "review";
export type SwagState = {
  conversationId: string; revision: number; active: boolean; name: string; step: SwagStep;
  productIds: string[]; products: Array<Record<string, unknown> & { id: string; name: string }>;
  shopIds: string[]; stores: Array<{ id: string; name: string; status: string }>;
  storeOptions?: Array<{ id: string; name: string; status: string }>;
  artwork: "none" | "saved" | "upload" | null; artworkAttachmentId?: string;
  artworkName?: string; artworkPreviewUrl?: string; artworkStatus: string;
  collectionId?: string; editorPath?: string; designReady: boolean; persisted: boolean; hasUnsavedChanges: boolean;
  designs: Array<Record<string, unknown>>;
  invalidProductIds?: string[]; invalidStoreIds?: string[];
  savedDesignChanged?: boolean;
  automaticArtworkAvailable?: boolean; canRefreshSavedDesign?: boolean;
  artworkProductIds?: string[]; replaceArtwork?: boolean;
};
export type SwagPatch = Partial<Pick<SwagState, "name" | "step" | "artwork" | "shopIds" | "collectionId" | "artworkAttachmentId">> & {
  addProductIds?: string[]; removeProductIds?: string[]; artworkProductIds?: string[]; replaceArtwork?: boolean; refreshSavedDesign?: boolean;
};
export type SwagCatalogQuery = { query?: string; category?: string; page?: number; limit?: number };
export type SwagCatalogPage = { items: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
export const getSwagState = (id: string) => apiFetch<{ state: SwagState | null }>(`/copilot/conversations/${id}/swag`);
export const configureSwagState = (id: string, revision: number, patch: SwagPatch) => apiFetch<{ state: SwagState }>(`/copilot/conversations/${id}/swag`, {
  method: "POST", body: JSON.stringify({ ...patch, revision }),
});
export const browseSwagCatalog = (id: string, query: SwagCatalogQuery) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)); });
  return apiFetch<SwagCatalogPage>(`/copilot/conversations/${id}/swag/catalog?${params}`);
};
export const prepareSwagReview = (id: string, revision: number, action: "save" | "publish" | "apply") => apiFetch<{ artifact: CopilotConfirmationArtifact }>(`/copilot/conversations/${id}/swag/prepare`, {
  method: "POST", body: JSON.stringify({ revision, action }),
});
