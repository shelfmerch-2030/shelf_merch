/**
 * Thin bridge between the vanilla shelf-merch.js engine and TypeScript API services.
 */
import { ApiError, apiFetch, publicFetch } from "./api";
import {
  clearSession,
  getRefreshToken,
  getStoredUser,
  isAuthenticated,
  isPlatformUser,
  setSession,
  type AuthUser,
} from "./auth-store";
import { USE_MOCKS } from "./config";
import {
  createCollectionApi,
  createKitApi,
  updateKitApi,
  uploadKitArtworkApi,
  launchKitCampaignApi,
  launchPointsCampaignApi,
  linkCollectionToShopApi,
  archiveCollectionApi,
  restoreCollectionApi,
  deleteCollectionApi,
  syncOrgWizardApi,
} from "./mutations-api";
import type { UiCollection } from "./mappers";
import { mapCatalogProduct } from "./mappers";
import {
  createContactsApi,
  createShopApi,
  fetchContactsImportStatusApi,
  fetchWorkspaceSnapshot,
  listContactsApi,
  publishShopApi,
  updateContactApi,
  updateShopApi,
  uploadContactsImportApi,
  type ContactImportStatus,
  type WorkspaceSnapshot,
} from "./workspace-api";
import type { UiContact, UiProduct } from "./mappers";

export { ApiError, getStoredUser, isAuthenticated, isPlatformUser };
export type { AuthUser };

export function useMocks(): boolean {
  return USE_MOCKS;
}

type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: Parameters<typeof setSession>[0]["user"];
};

async function establishSession(result: AuthResult) {
  setSession(result);
  return result.user;
}

export async function login(email: string, password: string) {
  const result = await apiFetch<AuthResult>("/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  return establishSession(result);
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}) {
  const result = await apiFetch<AuthResult>("/auth/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify(payload),
  });
  return establishSession(result);
}

export async function logout() {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    }
  } finally {
    clearSession();
  }
}

export async function tryRestoreSession(): Promise<WorkspaceSnapshot | "platform" | null> {
  if (!isAuthenticated()) return null;
  const me = getStoredUser();
  if (isPlatformUser(me)) return "platform";
  try {
    return await fetchWorkspaceSnapshot(me);
  } catch {
    return null;
  }
}

export async function hydrateWorkspace(sessionUser?: AuthUser | null): Promise<WorkspaceSnapshot> {
  return fetchWorkspaceSnapshot(sessionUser);
}

/** Fresh catalog from DB — call when opening the Catalog page. */
export type CatalogProductsResult = {
  items: UiProduct[];
  total: number;
};

export async function refreshCatalogProducts(category?: string): Promise<CatalogProductsResult> {
  const params = new URLSearchParams({ limit: "100" });
  if (category) params.set("category", category);
  const catalog = await apiFetch<{
    items: unknown[];
    pagination?: { total?: number };
  }>(`/catalog/products?${params.toString()}`);
  const items = (catalog.items || []).map((p) => mapCatalogProduct(p));
  return {
    items,
    total: catalog.pagination?.total ?? items.length,
  };
}

export { fetchPlatformDashboard } from "./platform-api";

export function applyWorkspaceToState(S: Record<string, unknown>, data: WorkspaceSnapshot) {
  const prevOrg = (S.org ?? {}) as {
    step?: number;
    seq?: number;
    inWizard?: boolean;
    _c?: number;
  };
  S.account = data.account;
  S.user = {
    ...data.userPatch,
    email: data.userPatch.email,
    role: data.userPatch.role || "company_admin",
  };
  S.shops = data.shops;
  S.contacts = data.contacts;
  S.kits = data.kits;
  S.collections = data.collections;
  S.catalogProducts = data.catalogProducts;
  S.catalogTotal = data.catalogTotal;
  S.campaigns = data.campaigns;
  S.orders = data.orders;
  S.wallets = data.wallets;
  S.primaryEntityId = data.primaryEntityId;
  // Replace org data from API; keep only in-progress wizard navigation state.
  S.org = {
    step: prevOrg.step ?? 1,
    seq: prevOrg.seq ?? 6,
    _c: prevOrg._c,
    inWizard: prevOrg.inWizard ?? false,
    ...data.org,
  };
}

export async function createShopFlow(payload: {
  name: string;
  currency: string;
  categories: string[];
  logoUrl?: string;
  bannerConfig?: Record<string, unknown>;
}) {
  const currencyMode =
    payload.currency === "INR"
      ? "inr"
      : payload.currency === "Priceless"
        ? "priceless"
        : "points";
  const draft = await createShopApi({
    name: payload.name,
    currencyMode,
    categories: payload.categories,
    logoUrl: payload.logoUrl || "",
    bannerConfig: payload.bannerConfig || {},
  });
  return publishShopApi(draft.id);
}

export async function updateShopFlow(
  shopId: string,
  payload: { logoUrl?: string; bannerConfig?: Record<string, unknown> },
) {
  return updateShopApi(shopId, payload);
}

export async function addContactsFlow(emails: string[], role: string) {
  const entries = emails.map((email) => ({
    email,
    name: email.split("@")[0] || email,
    role,
  }));
  return createContactsApi(entries);
}

export async function addContactFlow(payload: {
  name: string;
  email: string;
  phone?: string;
  role: string;
  department?: string;
  employeeCode?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
}) {
  const result = await createContactsApi([payload]);
  return result[0];
}

export async function updateContactFlow(
  contactId: string,
  payload: {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    department?: string;
    employeeCode?: string;
    address?: {
      line1?: string;
      city?: string;
      state?: string;
      pincode?: string;
      country?: string;
    };
  },
): Promise<UiContact> {
  return updateContactApi(contactId, payload);
}

export type { ContactImportStatus };

export async function importContactsFlow(
  file: File,
  onStatus?: (status: ContactImportStatus) => void,
): Promise<ContactImportStatus> {
  const { importJobId } = await uploadContactsImportApi(file);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const status = await fetchContactsImportStatusApi(importJobId);
    onStatus?.(status);
    if (status.status === "done" || status.status === "failed") return status;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("Import is taking longer than expected. Please try again in a moment.");
}

export async function refreshContactsFlow(): Promise<UiContact[]> {
  return listContactsApi();
}

export async function createKitFlow(payload: {
  name: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging: string;
  designNotes?: string;
  artwork?: { file?: File; preview?: string; name?: string };
}) {
  const kit = await createKitApi({
    ...payload,
    packaging: payload.packaging === "box" ? "box" : "none",
  });
  if (payload.artwork?.file) {
    return uploadKitArtworkApi(kit.id, payload.artwork.file);
  }
  return kit;
}

export async function updateKitFlow(payload: {
  id: string;
  name?: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging?: string;
  designNotes?: string;
  artwork?: { file?: File; preview?: string; name?: string };
}) {
  let kit = await updateKitApi({
    ...payload,
    packaging: payload.packaging === "box" ? "box" : payload.packaging === "none" ? "none" : undefined,
  });
  if (payload.artwork?.file) {
    kit = await uploadKitArtworkApi(kit.id, payload.artwork.file);
  }
  return kit;
}

export async function createCollectionFlow(payload: {
  shopId?: string;
  name: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  preferredColors?: string[];
  artwork?: { file?: File; preview?: string; name?: string };
  mockups?: Array<{ catalogProductId: string; dataUrl: string }>;
}) {
  return createCollectionApi(payload);
}

export async function linkCollectionToShopFlow(collectionId: string, shopId: string) {
  return linkCollectionToShopApi(collectionId, shopId);
}

export async function archiveCollectionFlow(collectionId: string) {
  return archiveCollectionApi(collectionId);
}

export async function restoreCollectionFlow(collectionId: string) {
  return restoreCollectionApi(collectionId);
}

export async function deleteCollectionFlow(collectionId: string) {
  return deleteCollectionApi(collectionId);
}

export async function addProductToShopFlow(payload: {
  shopId: string;
  collection: UiCollection;
  product: UiProduct;
  catalog: UiProduct[];
}) {
  const catalogIndex = payload.product.id
    ? payload.catalog.findIndex((p) => p.id === payload.product.id)
    : payload.catalog.findIndex(
        (p) =>
          p.g === payload.product.g &&
          p.nm === payload.product.nm &&
          (p.brand || "") === (payload.product.brand || ""),
      );
  if (catalogIndex < 0) {
    throw new Error("Could not match this product to the catalog");
  }
  return createCollectionApi({
    shopId: payload.shopId,
    name: payload.collection.name,
    pickedIndices: [catalogIndex],
    catalog: payload.catalog,
    preferredColors: payload.collection.preferredColors || [],
    artworkUrl: payload.collection.artworkUrl || undefined,
    isShopSpecific: true,
  });
}

export async function launchPointsCampaignFlow(payload: {
  entityId: string;
  shopId: string;
  name: string;
  creditsPerRecipient: number;
  message: { from: string; body: string };
  contactIds: string[];
  contacts: Array<{ id: string; name: string; email: string; phone?: string }>;
}) {
  const recipients = payload.contactIds
    .map((id) => payload.contacts.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({ name: c!.name, email: c!.email, phone: c!.phone }));
  if (!recipients.length) throw new Error("Select at least one recipient");
  return launchPointsCampaignApi({
    entityId: payload.entityId,
    shopId: payload.shopId,
    name: payload.name,
    creditsPerRecipient: payload.creditsPerRecipient,
    message: payload.message,
    recipients,
  });
}

export async function launchKitCampaignFlow(payload: {
  entityId: string;
  kitId: string;
  name: string;
  fulfillmentMode?: "redeem" | "surprise" | "single";
  singleLocation?: {
    name: string;
    email: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  message: { from: string; body: string };
  schedule?: { mode: "now" | "scheduled" | "self"; sendAt?: string | null; timezone?: string };
  contactIds: string[];
  contacts: Array<{ id: string; name: string; email: string; phone?: string }>;
}) {
  const recipients = payload.contactIds
    .map((id) => payload.contacts.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({ contactId: c!.id, name: c!.name, email: c!.email, phone: c!.phone }));
  if (!recipients.length) throw new Error("Select at least one recipient");
  return launchKitCampaignApi({
    entityId: payload.entityId,
    kitId: payload.kitId,
    name: payload.name,
    fulfillmentMode: payload.fulfillmentMode,
    singleLocation: payload.singleLocation,
    message: payload.message,
    schedule: payload.schedule,
    recipients,
  });
}

export async function syncOrgWizard(org: Parameters<typeof syncOrgWizardApi>[0]) {
  return syncOrgWizardApi(org);
}

export async function acceptInvite(token: string, password: string) {
  const result = await apiFetch<{ success: boolean; email: string }>("/users/accept-invite", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ token, password }),
  });
  try {
    return await login(result.email, password);
  } catch (err) {
    // Account was activated even if auto-login fails (e.g. stale session).
    if (err instanceof ApiError && err.code === "INVITE_PENDING") {
      throw err;
    }
    return { email: result.email, activated: true as const };
  }
}

// --- Public redemption API (no auth) ---

export async function getRedemptionPortal(token: string) {
  return publicFetch(`/redemptions/${token}`);
}

export type StorefrontData = {
  shop: { id: string; name: string; logoUrl?: string; bannerTheme?: string; currencyMode: string };
  products: Array<{
    _id: string;
    name: string;
    brand?: string;
    group?: string;
    category?: string;
    description?: string;
    basePriceInr: number;
    primaryImageUrl?: string;
    imageUrls?: string[];
    maskImageUrl?: string;
    baseImageUrl?: string;
    artworkUrl?: string;
    mockupUrl?: string;
    preferredColors?: string[];
    printAreas?: Array<{
      key?: string;
      label?: string;
      mockupImageUrl?: string;
      box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
    }>;
    variants?: Array<{ size?: string; color?: string; colorHex?: string; material?: string; sku?: string }>;
  }>;
};

export async function getPublicStorefront(shopId: string) {
  return publicFetch<StorefrontData>(`/storefront/${shopId}`);
}

export async function sendRedemptionOtp(token: string, contact: string) {
  return publicFetch(`/redemptions/${token}/send-otp`, {
    method: "POST",
    body: JSON.stringify({ contact }),
  });
}

export async function verifyRedemptionOtp(token: string, code: string) {
  return publicFetch<{ sessionToken: string }>(`/redemptions/${token}/verify-otp`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function getRedemptionCatalog(token: string, sessionToken: string) {
  return publicFetch(`/redemptions/${token}/catalog`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}

export type KitRedemptionItem = {
  productId: string;
  name: string;
  brand: string;
  group: string;
  category?: string;
  isDrinkware?: boolean;
  imageUrl: string;
  artworkUrl: string;
  mockupUrl?: string;
  maskImageUrl?: string;
  baseImageUrl?: string;
  primaryImageUrl?: string;
  imageUrls?: string[];
  printAreas?: Array<{
    key?: string;
    label?: string;
    mockupImageUrl?: string;
    box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  }>;
  requiresSize: boolean;
  requiresColor: boolean;
  sizes: string[];
  colors: string[];
  qty: number;
};

export type KitRedemptionData = {
  kit: { name: string; artworkUrl: string; packaging: string };
  items: KitRedemptionItem[];
};

export async function getRedemptionKit(token: string, sessionToken: string) {
  return publicFetch<KitRedemptionData>(`/redemptions/${token}/kit`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}

export async function submitRedemption(
  token: string,
  sessionToken: string,
  payload: unknown,
  idempotencyKey: string,
) {
  return publicFetch(`/redemptions/${token}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
    idempotencyKey,
    body: JSON.stringify(payload),
  });
}

export async function trackRedemption(token: string) {
  return publicFetch(`/redemptions/${token}/track`);
}
