import { ApiError, apiFetch } from "./api";
import { getStoredUser } from "./auth-store";
import { mapCampaign, mapCollection, mapKit, type UiProduct } from "./mappers";

const MONGO_ID = /^[a-f0-9]{24}$/i;

type OrgWizardState = {
  wallet: {
    id?: string;
    name: string;
    amount: number;
    start: string;
    end: string;
    funding: string;
    docType: string;
    docNumber: string;
  };
  departments: Array<{
    id: string | number;
    name: string;
    desc: string;
    users: number;
    allocated: number;
    color: string;
    mgr: { name: string; email: string; mobile: string; role: string; invite: boolean };
  }>;
};

function walletIdFromResponse(wallet: Record<string, unknown>): string {
  const id = wallet._id ?? wallet.id;
  if (!id || !MONGO_ID.test(String(id))) {
    throw new Error("Wallet create response missing a valid id");
  }
  return String(id);
}

async function resolveWalletId(org: OrgWizardState): Promise<string> {
  let candidate = org.wallet.id?.trim();
  const tenantId = getStoredUser()?.tenantId;

  // Stale UI state sometimes stores tenantId where a wallet id belongs.
  if (candidate && tenantId && candidate === tenantId) {
    candidate = undefined;
  }

  if (candidate && MONGO_ID.test(candidate)) {
    try {
      const existing = await apiFetch<{ balance?: number }>(`/wallets/${candidate}`);
      if (org.wallet.amount > 0 && Number(existing.balance ?? 0) === 0) {
        await apiFetch(`/wallets/${candidate}/fund`, {
          method: "POST",
          idempotencyKey: `fund-${candidate}-setup`,
          body: JSON.stringify({
            amount: org.wallet.amount,
            description: "Organization wallet setup funding",
          }),
        });
      }
      return candidate;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err;
    }
  }

  const wallet = await apiFetch<Record<string, unknown>>("/wallets", {
    method: "POST",
    body: JSON.stringify({
      name: org.wallet.name,
      currency: "INR",
      validFrom: org.wallet.start || null,
      validTo: org.wallet.end || null,
      fundingMethod: org.wallet.funding === "pay" ? "online" : "po_upload",
      fundingDocument: {
        docType: org.wallet.docType || "",
        docNumber: org.wallet.docNumber || "",
      },
    }),
  });
  const walletId = walletIdFromResponse(wallet);

  if (org.wallet.amount > 0) {
    await apiFetch(`/wallets/${walletId}/fund`, {
      method: "POST",
      idempotencyKey: `fund-${walletId}-setup`,
      body: JSON.stringify({
        amount: org.wallet.amount,
        description: "Organization wallet setup funding",
      }),
    });
  }

  return walletId;
}

function productRefFromUi(p: UiProduct) {
  if (!p.id) throw new Error(`Product "${p.nm}" has no catalog id — reload the catalog`);
  return {
    catalogProductId: p.id,
    brand: p.brand || "",
    name: p.nm,
    group: p.g || "tee",
  };
}

export async function createKitApi(payload: {
  name: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging: "none" | "box";
  designNotes?: string;
}) {
  const productRefs = payload.pickedIndices.map((i) => {
    const p = payload.catalog[i];
    if (!p) throw new Error("Invalid product selection");
    return productRefFromUi(p);
  });
  const kit = await apiFetch<Record<string, unknown>>("/kits", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      productRefs,
      packaging: payload.packaging === "box" ? "box" : "none",
      designNotes: payload.designNotes || "",
      status: "live",
    }),
  });
  return mapKit(kit);
}

export async function updateKitApi(payload: {
  id: string;
  name?: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  packaging?: "none" | "box";
  designNotes?: string;
}) {
  const productRefs = payload.pickedIndices.map((i) => {
    const p = payload.catalog[i];
    if (!p) throw new Error("Invalid product selection");
    return productRefFromUi(p);
  });
  const body: Record<string, unknown> = { productRefs };
  if (payload.name != null) body.name = payload.name;
  if (payload.packaging != null) body.packaging = payload.packaging;
  if (payload.designNotes != null) body.designNotes = payload.designNotes;

  const kit = await apiFetch<Record<string, unknown>>(`/kits/${payload.id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return mapKit(kit);
}

export async function uploadKitArtworkApi(kitId: string, file: File) {
  const form = new FormData();
  form.append("artwork", file);
  const kit = await apiFetch<Record<string, unknown>>(`/kits/${kitId}/artwork`, {
    method: "POST",
    body: form,
  });
  return mapKit(kit);
}

type ArtworkInput = { file?: File; preview?: string; name?: string };

async function artworkFileFromInput(art: ArtworkInput): Promise<File | null> {
  if (art.file instanceof File) return art.file;
  if (art.preview?.startsWith("data:")) {
    const res = await fetch(art.preview);
    const blob = await res.blob();
    return new File([blob], art.name || "artwork.png", { type: blob.type || "image/png" });
  }
  return null;
}

export async function uploadCollectionArtworkApi(collectionId: string, file: File) {
  const form = new FormData();
  form.append("artwork", file);
  const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}/artwork`, {
    method: "POST",
    body: form,
  });
  return mapCollection(col);
}

async function fileFromDataUrl(dataUrl: string, name: string): Promise<File | null> {
  if (!dataUrl?.startsWith("data:")) return null;
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/png" });
}

/** Persist one product's baked mockup (mask + artwork flattened) to a collection. */
export async function uploadCollectionMockupApi(collectionId: string, catalogProductId: string, file: File) {
  const form = new FormData();
  form.append("mockup", file);
  form.append("catalogProductId", catalogProductId);
  const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}/product-mockup`, {
    method: "POST",
    body: form,
  });
  return mapCollection(col);
}

export async function linkCollectionToShopApi(collectionId: string, shopId: string) {
  const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}`, {
    method: "PATCH",
    body: JSON.stringify({ shopId }),
  });
  return mapCollection(col);
}

export async function archiveCollectionApi(collectionId: string) {
  const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}/archive`, {
    method: "POST",
  });
  return mapCollection(col);
}

export async function restoreCollectionApi(collectionId: string) {
  const col = await apiFetch<Record<string, unknown>>(`/collections/${collectionId}/restore`, {
    method: "POST",
  });
  return mapCollection(col);
}

export async function deleteCollectionApi(collectionId: string) {
  await apiFetch(`/collections/${collectionId}`, { method: "DELETE" });
}

export async function createCollectionApi(payload: {
  shopId?: string;
  name: string;
  pickedIndices: number[];
  catalog: UiProduct[];
  preferredColors?: string[];
  artworkUrl?: string;
  artwork?: ArtworkInput;
  mockups?: Array<{ catalogProductId: string; dataUrl: string }>;
  isShopSpecific?: boolean;
}) {
  const productRefs = payload.pickedIndices.map((i) => {
    const p = payload.catalog[i];
    if (!p) throw new Error("Invalid product selection");
    return productRefFromUi(p);
  });
  const catalogById = new Map(
    payload.catalog.filter((p) => p.id).map((p) => [p.id as string, p]),
  );
  const body: Record<string, unknown> = {
    name: payload.name,
    productRefs,
    preferredColors: payload.preferredColors || [],
  };
  if (payload.shopId) body.shopId = payload.shopId;
  if (payload.artworkUrl) body.artworkUrl = payload.artworkUrl;
  if (payload.isShopSpecific) body.isShopSpecific = true;
  const col = await apiFetch<Record<string, unknown>>("/collections", {
    method: "POST",
    body: JSON.stringify(body),
  });
  let result = mapCollection(col, "", catalogById);
  if (payload.artwork) {
    const file = await artworkFileFromInput(payload.artwork);
    if (file) result = await uploadCollectionArtworkApi(result.id, file);
  }
  // Persist each baked mockup so the design is a single image that survives
  // reloads and flows into the storefront and orders.
  for (const m of payload.mockups || []) {
    if (!m.catalogProductId || !m.dataUrl) continue;
    const file = await fileFromDataUrl(m.dataUrl, "mockup.png");
    if (file) {
      try {
        result = await uploadCollectionMockupApi(result.id, m.catalogProductId, file);
      } catch {
        // Non-fatal: the collection is still saved; the view falls back to the
        // live mask+overlay composite if a mockup fails to upload.
      }
    }
  }
  return result;
}

export async function launchPointsCampaignApi(payload: {
  entityId: string;
  shopId: string;
  name: string;
  creditsPerRecipient: number;
  message: { from: string; body: string };
  recipients: Array<{ name: string; email: string; phone?: string }>;
}) {
  const campaign = await apiFetch<Record<string, unknown>>("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      entityId: payload.entityId,
      name: payload.name,
      type: "points",
      shopId: payload.shopId,
      message: payload.message,
      schedule: { mode: "now" },
    }),
  });
  const campaignId = String(campaign._id);

  await apiFetch(`/campaigns/${campaignId}/recipients/import`, {
    method: "POST",
    body: JSON.stringify({
      recipients: payload.recipients.map((r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone || "",
      })),
    }),
  });

  await apiFetch(`/campaigns/${campaignId}/allocate-credits`, {
    method: "POST",
    body: JSON.stringify({ creditsPerRecipient: payload.creditsPerRecipient }),
  });

  const launched = await apiFetch<Record<string, unknown>>(`/campaigns/${campaignId}/launch`, {
    method: "POST",
    idempotencyKey: `launch-${campaignId}-${Date.now()}`,
  });
  return mapCampaign(launched);
}

export async function launchKitCampaignApi(payload: {
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
  recipients: Array<{ contactId?: string; name: string; email: string; phone?: string }>;
}) {
  const campaign = await apiFetch<Record<string, unknown>>("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      entityId: payload.entityId,
      name: payload.name,
      type: "kit",
      fulfillmentMode: payload.fulfillmentMode ?? "redeem",
      singleLocation: payload.singleLocation,
      kitId: payload.kitId,
      message: payload.message,
      schedule: payload.schedule ?? { mode: "now" },
    }),
  });
  const campaignId = String(campaign._id);

  await apiFetch(`/campaigns/${campaignId}/recipients/import`, {
    method: "POST",
    body: JSON.stringify({
      recipients: payload.recipients.map((r) => ({
        contactId: r.contactId,
        name: r.name,
        email: r.email,
        phone: r.phone || "",
      })),
    }),
  });

  const launched = await apiFetch<Record<string, unknown>>(`/campaigns/${campaignId}/launch`, {
    method: "POST",
    idempotencyKey: `launch-kit-${campaignId}-${Date.now()}`,
  });
  return mapCampaign(launched);
}

export type OrgWizardInvite = {
  email: string;
  name: string;
  entityName: string;
  inviteToken?: string;
};

type ApiEntityRow = {
  _id?: string;
  id?: string;
  walletId?: string;
  allocatedAmount?: number;
};

export async function syncOrgWizardApi(
  org: OrgWizardState,
): Promise<{ walletId: string; invites: OrgWizardInvite[] }> {
  const defaultWalletId = await resolveWalletId(org);
  const allocationsByWallet = new Map<string, Array<{ entityId: string; amount: number }>>();
  const walletsToActivate = new Set<string>();
  const invites: OrgWizardInvite[] = [];
  let primaryWalletId = defaultWalletId;

  const pushAllocation = (walletId: string, entityId: string, amount: number) => {
    if (amount <= 0) return;
    const list = allocationsByWallet.get(walletId) ?? [];
    list.push({ entityId, amount });
    allocationsByWallet.set(walletId, list);
    walletsToActivate.add(walletId);
  };

  for (const dept of org.departments) {
    const existingId = String(dept.id);
    const isMongoId = MONGO_ID.test(existingId);
    let entityId = isMongoId ? existingId : "";
    let entityWalletId = defaultWalletId;
    let currentAllocated = 0;

    if (entityId) {
      const entity = await apiFetch<ApiEntityRow>(`/entities/${entityId}`);
      entityWalletId = String(entity.walletId ?? defaultWalletId);
      currentAllocated = Number(entity.allocatedAmount ?? 0);
      primaryWalletId = entityWalletId;
    } else {
      const entity = await apiFetch<ApiEntityRow>("/entities", {
        method: "POST",
        body: JSON.stringify({
          walletId: defaultWalletId,
          name: dept.name,
          description: dept.desc || "",
          colorHex: dept.color || "#2563EB",
          expectedUsers: dept.users || 0,
        }),
      });
      entityId = String(entity._id ?? entity.id);
      entityWalletId = String(entity.walletId ?? defaultWalletId);
      primaryWalletId = entityWalletId;
    }

    if (dept.mgr?.email && dept.mgr.invite) {
      const res = await apiFetch<{
        manager?: { email?: string };
        inviteToken?: string;
      }>(`/entities/${entityId}/assign-manager`, {
        method: "POST",
        body: JSON.stringify({
          name: dept.mgr.name || dept.mgr.email.split("@")[0],
          email: dept.mgr.email,
          role: dept.mgr.role || "",
          mobile: dept.mgr.mobile || "",
        }),
      });
      invites.push({
        email: dept.mgr.email,
        name: dept.mgr.name || dept.mgr.email.split("@")[0],
        entityName: dept.name,
        inviteToken: res.inviteToken,
      });
    }

    const target = Number(dept.allocated) || 0;
    const delta = target - currentAllocated;
    pushAllocation(entityWalletId, entityId, delta);
  }

  for (const [walletId, allocations] of allocationsByWallet) {
    if (!allocations.length) continue;
    await apiFetch(`/wallets/${walletId}/allocate`, {
      method: "POST",
      idempotencyKey: `alloc-${walletId}-${allocations.map((a) => `${a.entityId}:${a.amount}`).join("|")}`,
      body: JSON.stringify({ allocations }),
    });
  }

  for (const walletId of walletsToActivate) {
    await apiFetch(`/wallets/${walletId}/activate`, { method: "POST" });
  }

  return { walletId: primaryWalletId, invites };
}
