import { apiFetch } from "./api";

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export async function fetchPlatformDashboard() {
  return apiFetch<{
    cards: {
      activeTenants: number;
      totalGmvInr: number;
      ordersInProgress: number;
      delayedOrders: number;
      openSupportTickets: number;
      lowStockItems: number;
      outstandingPaymentsInr: number;
    };
    sections: Record<string, unknown>;
  }>("/platform/dashboard");
}

export type TenantPrimaryAdmin = {
  id: string;
  name: string;
  email: string;
  status?: string;
} | null;

export type PlatformTenantRow = {
  _id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl?: string;
  currency?: string;
  gstin?: string;
  billingAddress?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
  /** @deprecated Phase 1 has no subscription plans */
  plan?: string;
  walletBalanceInr: number;
  walletBudgetBalanceInr?: number;
  walletAllocatedInr?: number;
  walletAvailableInr?: number;
  openOrders: number;
  userCount: number;
  lastActiveAt: string | null;
  primaryAdmin: TenantPrimaryAdmin;
};

export type TenantListParams = {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: "name" | "createdAt" | "lastActiveAt";
  order?: "asc" | "desc";
};

export async function fetchPlatformTenants(params: TenantListParams = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.search) search.set("search", params.search);
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.sort) search.set("sort", params.sort);
  if (params.order) search.set("order", params.order);
  const q = search.toString();
  const res = await apiFetch<{
    items: PlatformTenantRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/platform/tenants${q ? `?${q}` : ""}`);
  return {
    items: res.items ?? [],
    total: res.pagination?.total ?? 0,
    page: res.pagination?.page ?? 1,
    limit: res.pagination?.limit ?? 20,
    totalPages: res.pagination?.totalPages ?? 1,
  };
}

export function fetchPlatformTenant(id: string) {
  return apiFetch<PlatformTenantRow>(`/platform/tenants/${id}`);
}

export function fetchTenantOverview(id: string) {
  return apiFetch<{
    tenant: PlatformTenantRow;
    primaryAdmin: TenantPrimaryAdmin;
    userCount: number;
    lastActiveAt: string | null;
    wallets: Array<{
      _id: string;
      name: string;
      balance: number;
      totalAmount?: number;
      allocatedAmount?: number;
      approvedBudgetInr?: number;
      allocatedBudgetInr?: number;
      remainingBalanceInr?: number;
      status?: string;
    }>;
    walletBalanceInr: number;
    walletBudgetBalanceInr?: number;
    walletAllocatedInr?: number;
    walletAvailableInr?: number;
    openOrders: number;
    activeCampaigns: number;
    unpaidInvoices: unknown[];
    outstandingInr: number;
    openTickets: number;
  }>(`/platform/tenants/${id}/overview`);
}

export function fetchTenantUsers(id: string) {
  return apiFetch<
    Array<{
      id: string;
      name: string;
      email: string;
      status: string;
      role: string | null;
      lastLoginAt?: string | null;
    }>
  >(`/platform/tenants/${id}/users`);
}

export function updatePlatformTenant(
  id: string,
  body: Record<string, unknown> & { confirmSlugChange?: boolean },
) {
  return apiFetch(`/platform/tenants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function setPrimaryAdmin(id: string, userId: string, reason?: string) {
  return apiFetch(`/platform/tenants/${id}/primary-admin`, {
    method: "PATCH",
    body: JSON.stringify({ userId, ...(reason ? { reason } : {}) }),
  });
}

export async function fetchPlatformOrders(params?: {
  status?: string;
  limit?: number;
  tenantId?: string;
  page?: number;
}) {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.page) search.set("page", String(params.page));
  if (params?.tenantId) search.set("tenantId", params.tenantId);
  const q = search.toString();
  return apiFetch<Paginated<Record<string, unknown>>>(`/platform/orders${q ? `?${q}` : ""}`);
}

export type ArtworkPlacement = {
  printCxPct?: number;
  printCyPct?: number;
  printWPct?: number;
  xPct: number;
  yPct: number;
  wPct: number;
  rot: number;
};

export type PhysicalDimensions = {
  width: number;
  height: number;
  length?: number;
};

export type OrderItemProduct = {
  _id: string;
  name: string;
  baseImageUrl?: string;
  maskImageUrl?: string;
  primaryImageUrl?: string;
  imageUrls?: string[];
  printAreas?: PrintArea[];
  variants?: ProductVariant[];
  artworkUrl?: string;
  /** Baked design mockup from the collection/kit productRef. */
  designedMockupUrl?: string;
  /** Saved Konva placement from the design wizard. */
  placement?: ArtworkPlacement | null;
};

export function fetchPlatformOrder(id: string) {
  return apiFetch<Record<string, unknown>>(`/platform/orders/${id}`);
}

export type PlatformProductListItem = {
  _id: string;
  name: string;
  sku: string;
  status: string;
  sellingPriceInr: number;
  costPriceInr: number;
  marginInr: number;
  marginPct: number;
  inventory?: { available?: number };
  createdAt?: string;
};

/**
 * Load platform catalog products. Walks every page so the list is not truncated
 * at the API max page size (products beyond the first page were previously
 * invisible in /platform/catalog and kit pickers).
 */
export async function fetchPlatformProducts(params?: {
  status?: string;
  limit?: number;
  search?: string;
}): Promise<Paginated<PlatformProductListItem>> {
  const pageSize = Math.min(Math.max(params?.limit ?? 250, 1), 250);
  const items: PlatformProductListItem[] = [];
  let page = 1;
  let total = Infinity;
  let totalPages = Infinity;

  while (page <= totalPages && items.length < total) {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.search) search.set("search", params.search);
    search.set("limit", String(pageSize));
    search.set("page", String(page));

    const res = await apiFetch<{
      items: PlatformProductListItem[];
      pagination?: { page: number; limit: number; total: number; totalPages: number };
    }>(`/platform/products?${search.toString()}`);

    const batch = res.items ?? [];
    items.push(...batch);
    total = res.pagination?.total ?? items.length;
    totalPages = res.pagination?.totalPages ?? page;
    if (!batch.length) break;
    page += 1;
  }

  return { items, total, page: 1, limit: items.length };
}

export async function fetchPlatformInventory(limit = 100) {
  return apiFetch<
    Paginated<{
      productId: string;
      name: string;
      sku: string;
      mode: string;
      available: number;
      reserved: number;
      lowStockThreshold: number;
      stockStatus: string;
    }>
  >(`/platform/inventory?limit=${limit}`);
}

export type InventoryTxnType = "add" | "reduce" | "adjust";

export function adjustInventory(
  productId: string,
  body: { type: InventoryTxnType; qty: number; reason: string; variantSku?: string },
) {
  return apiFetch(`/platform/inventory/${productId}/transactions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function setInventoryMode(
  productId: string,
  body: { mode?: "physical" | "made_to_order"; lowStockThreshold?: number },
) {
  return apiFetch(`/platform/inventory/${productId}/mode`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchPlatformKits(params?: { status?: "all" }) {
  return apiFetch<
    Array<{
      _id: string;
      name: string;
      status: string;
      approxValueInr: number;
      items?: unknown[];
    }>
  >(`/platform/kits${params?.status === "all" ? "?status=all" : ""}`);
}

export type KitRules = {
  fixedComposition: boolean;
  customizationAllowed: boolean;
  /** When true (default), tenants must upload a logo when sending this curated kit. */
  requireLogo: boolean;
  minQtyPerRecipient: number;
  maxQtyPerRecipient: number;
};

export type KitItem = {
  _id?: string;
  catalogProductId: string;
  variantSku?: string;
  qty?: number;
};

export type KitItemImage = {
  imageUrl: string;
  label?: string;
};

export type KitVariantImage = {
  imageUrl: string;
  label?: string;
};

export type PlatformKit = {
  _id: string;
  name: string;
  description?: string;
  packaging: string;
  eligibleCampaignTypes: string[];
  approxValueInr: number;
  imageUrls: string[];
  heroImage?: string;
  galleryImages?: string[];
  itemImages?: KitItemImage[];
  variantImages?: KitVariantImage[];
  items: KitItem[];
  rules?: KitRules;
  status: string;
  /** Provenance — imported (e.g. Shopify) kits are curated, self-contained bundles. */
  source?: { provider?: string; domain?: string; externalId?: string; handle?: string };
};

export type KitInput = {
  name: string;
  description?: string;
  packaging?: string;
  eligibleCampaignTypes?: string[];
  approxValueInr?: number;
  rules?: Partial<KitRules>;
  heroImage?: string;
  galleryImages?: string[];
  itemImages?: KitItemImage[];
  variantImages?: KitVariantImage[];
};

export function getPlatformKit(id: string) {
  return apiFetch<PlatformKit>(`/platform/kits/${id}`);
}

export function createKit(body: KitInput) {
  return apiFetch<PlatformKit>("/platform/kits", { method: "POST", body: JSON.stringify(body) });
}

export function updateKit(id: string, body: Partial<KitInput>) {
  return apiFetch<PlatformKit>(`/platform/kits/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export type KitImageRolesInput = {
  heroImage?: string;
  galleryImages?: string[];
  itemImages?: KitItemImage[];
  variantImages?: KitVariantImage[];
};

/** Update ONLY hero / included-product / variant image roles — no other kit fields. */
export function updateKitImageRoles(id: string, body: KitImageRolesInput) {
  return apiFetch<PlatformKit>(`/platform/kits/${id}/image-roles`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function addKitItem(id: string, item: KitItem) {
  return apiFetch<KitItem[]>(`/platform/kits/${id}/items`, { method: "POST", body: JSON.stringify(item) });
}

export function removeKitItem(id: string, itemId: string) {
  return apiFetch<KitItem[]>(`/platform/kits/${id}/items/${itemId}`, { method: "DELETE" });
}

export function uploadKitImages(id: string, files: File[]) {
  const form = new FormData();
  for (const file of files) form.append("images", file);
  return apiFetch<{ imageUrls: string[] }>(`/platform/kits/${id}/images`, { method: "POST", body: form });
}

export function removeKitImage(id: string, imageUrl: string) {
  return apiFetch<PlatformKit>(`/platform/kits/${id}/images`, {
    method: "DELETE",
    body: JSON.stringify({ imageUrl }),
  });
}

export function publishKit(id: string) {
  return apiFetch<PlatformKit>(`/platform/kits/${id}/publish`, { method: "POST" });
}

export async function fetchPlatformShipments(limit = 50) {
  return apiFetch<Paginated<Record<string, unknown>>>(`/platform/shipments?limit=${limit}`);
}

export async function fetchPlatformSupport(
  limit = 50,
  filter?: { assignedToUserId?: string; unassigned?: boolean },
) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (filter?.assignedToUserId) q.set("assignedToUserId", filter.assignedToUserId);
  if (filter?.unassigned) q.set("unassigned", "true");
  return apiFetch<Paginated<Record<string, unknown>>>(`/platform/support-tickets?${q}`);
}

export type DemoLeadRow = {
  _id: string;
  fullName: string;
  companyName: string;
  workEmail: string;
  mobileNumber: string;
  requirement?: string | null;
  status: string;
  source?: string;
  confirmationEmailSentAt?: string | null;
  signupInviteSentAt?: string | null;
  signupInviteCount?: number;
  createdAt: string;
  updatedAt?: string;
};

export async function fetchPlatformDemoLeads(limit = 100) {
  const res = await apiFetch<{
    items: DemoLeadRow[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/platform/demo-leads?limit=${limit}`);
  return {
    items: res.items ?? [],
    total: res.pagination?.total ?? 0,
    page: res.pagination?.page ?? 1,
    limit: res.pagination?.limit ?? limit,
  };
}

export type SignupInviteResult = {
  email: string;
  allowlisted: boolean;
  inviteSent: boolean;
  signupUrl: string;
  lead: {
    id: string;
    status: string;
    signupInviteSentAt?: string | null;
    signupInviteCount?: number;
  } | null;
};

/** Allowlist a lead email and send the /signup invite email. */
export async function inviteDemoLeadSignup(leadId: string) {
  return apiFetch<SignupInviteResult>(`/platform/demo-leads/${leadId}/invite-signup`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Allowlist any email and send the /signup invite email. */
export async function inviteSignupByEmail(payload: {
  email: string;
  fullName?: string;
  companyName?: string;
}) {
  return apiFetch<SignupInviteResult>(`/platform/demo-leads/invite-signup`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchProductionBoard() {
  return apiFetch<{
    taskBuckets: Record<string, { count: number; tasks: unknown[] }>;
    orderBuckets: Record<string, { count: number; orders: unknown[] }>;
    totalTasks: number;
    totalOrders: number;
  }>("/platform/production");
}

export async function fetchFinanceOutstanding() {
  return apiFetch<
    Array<{
      tenantId: string;
      tenantName: string;
      tenantStatus: string;
      walletBalanceInr: number;
      outstandingInr: number;
      unpaidInvoices: number;
    }>
  >("/platform/finance/outstanding");
}

export async function fetchFundingApprovals() {
  return apiFetch<unknown[]>("/platform/finance/funding-approvals");
}

export function approveFunding(walletId: string, amount: number) {
  return apiFetch(`/platform/finance/funding-approvals/${walletId}/approve`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export function rejectFunding(walletId: string, reason: string) {
  return apiFetch(`/platform/finance/funding-approvals/${walletId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export type PlatformInvoice = {
  _id: string;
  invoiceNumber: string;
  type: "proforma" | "tax";
  status: string;
  totalAmount: number;
  gstAmount: number;
  tenantId: string;
  tenantName?: string;
  createdAt?: string;
};

export type PlatformCreditNote = {
  _id: string;
  creditNoteNumber: string;
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
  gstAmount?: number;
  reason: string;
  tenantId: string;
  tenantName?: string;
  createdAt?: string;
};

export async function fetchPlatformInvoices(params?: {
  type?: "proforma" | "tax";
  status?: string;
  tenantId?: string;
  page?: number;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.type) q.set("type", params.type);
  if (params?.status) q.set("status", params.status);
  if (params?.tenantId) q.set("tenantId", params.tenantId);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch<{
    items: PlatformInvoice[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/platform/finance/invoices${qs ? `?${qs}` : ""}`);
}

export async function fetchCreditNotes(params?: {
  tenantId?: string;
  invoiceId?: string;
  page?: number;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.tenantId) q.set("tenantId", params.tenantId);
  if (params?.invoiceId) q.set("invoiceId", params.invoiceId);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch<{
    items: PlatformCreditNote[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/platform/finance/credit-notes${qs ? `?${qs}` : ""}`);
}

export function createCreditNote(body: { invoiceId: string; amount: number; reason: string }) {
  return apiFetch<PlatformCreditNote>("/platform/finance/credit-notes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchPlatformTeam() {
  const rows = await apiFetch<
    Array<{
      id?: string;
      userId?: string;
      name: string;
      email: string;
      role: string;
      status: string;
      allowlisted?: boolean;
      protected?: boolean;
    }>
  >("/platform/team");
  // API historically returned `id`; normalize so assign/manage UIs always get userId.
  return rows.map((m) => ({
    ...m,
    userId: String(m.userId ?? m.id ?? ""),
    allowlisted: Boolean(m.allowlisted),
    protected: Boolean(m.protected) || isBuiltInPlatformEmail(m.email),
  }));
}

// ---- Tenant lifecycle controls (Phase 1: no subscription plans) ----
/** Operational statuses selectable in Phase 1 UI. Legacy `trial` may still appear in data. */
export const TENANT_STATUSES = ["active", "suspended", "archived"] as const;
/** @deprecated Phase 1 has no subscription plans — do not surface in UI. */
export const TENANT_PLANS = ["trial", "starter", "growth", "enterprise"] as const;

export function setTenantStatus(id: string, status: string, reason?: string) {
  return apiFetch(`/platform/tenants/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  });
}

/** @deprecated Phase 1 has no subscription plans. */
export function setTenantPlan(id: string, plan: string) {
  return apiFetch(`/platform/tenants/${id}/plan`, {
    method: "PATCH",
    body: JSON.stringify({ plan }),
  });
}

// ---- Platform team management ----
export const PLATFORM_ROLES = [
  "platform_super_admin",
  "platform_ops_admin",
  "platform_catalog_admin",
  "platform_finance_admin",
  "platform_sales_manager",
  "platform_logistics_manager",
  "platform_production_manager",
  "platform_support_agent",
  "platform_readonly_auditor",
] as const;

export const BUILT_IN_PLATFORM_EMAILS = [
  "admin@shelfmerch.io",
  "test@shelfmerch.io",
  "ops@shelfmerch.io",
  "catalog@shelfmerch.io",
  "production@shelfmerch.io",
  "finance@shelfmerch.io",
  "sales@shelfmerch.io",
  "support@shelfmerch.io",
  "logistics@shelfmerch.io",
  "auditor@shelfmerch.io",
] as const;

const BUILT_IN_PLATFORM_EMAIL_SET = new Set<string>(BUILT_IN_PLATFORM_EMAILS);

export function isBuiltInPlatformEmail(email: string) {
  return BUILT_IN_PLATFORM_EMAIL_SET.has(String(email ?? "").trim().toLowerCase());
}

export function inviteTeamMember(body: { name: string; email: string; role: string }) {
  return apiFetch("/platform/team", { method: "POST", body: JSON.stringify(body) });
}

export function changeTeamRole(userId: string, role: string) {
  return apiFetch(`/platform/team/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
}

export function deactivateTeamMember(userId: string) {
  return apiFetch(`/platform/team/${userId}/deactivate`, { method: "POST" });
}

export function reactivateTeamMember(userId: string) {
  return apiFetch(`/platform/team/${userId}/reactivate`, { method: "POST" });
}

// ---- Settings ----
export function updateSetting(key: string, value: unknown) {
  return apiFetch(`/platform/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
}

export async function fetchPlatformSettings() {
  return apiFetch<Record<string, unknown>>("/platform/settings");
}

export type DemoLoginPasswordStatus = {
  email: string;
  ttlDays: number;
  active: boolean;
  generatedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type DemoLoginPasswordGenerated = DemoLoginPasswordStatus & {
  password: string;
};

export async function fetchDemoLoginPassword() {
  return apiFetch<DemoLoginPasswordStatus>("/platform/settings/demo-login-password");
}

export async function generateDemoLoginPassword() {
  return apiFetch<DemoLoginPasswordGenerated>("/platform/settings/demo-login-password", {
    method: "POST",
  });
}

export async function revokeDemoLoginPassword() {
  return apiFetch<DemoLoginPasswordStatus>("/platform/settings/demo-login-password", {
    method: "DELETE",
  });
}

export async function fetchAuditLogs(
  limit = 50,
  params?: { tenantId?: string; page?: number },
) {
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  if (params?.tenantId) search.set("tenantId", params.tenantId);
  if (params?.page) search.set("page", String(params.page));
  return apiFetch<Paginated<Record<string, unknown>>>(`/platform/audit-logs?${search}`);
}

// ---- Catalog product management (platform_catalog_admin / super admin) ----

export type ProductVariant = {
  _id?: string;
  size?: string;
  color?: string;
  colorHex?: string;
  material?: string;
  sku: string;
  priceOverrideInr?: number | null;
  stock?: number;
  /** When false, hidden from tenant/storefront catalog. Defaults to true. */
  enabled?: boolean;
};

export type PrintAreaBox = { xPct: number; yPct: number; widthPct: number; heightPct: number };

export type PrintArea = {
  key?: string;
  label: string;
  mockupImageUrl?: string;
  xIn?: number;
  yIn?: number;
  widthIn?: number;
  heightIn?: number;
  scale?: number;
  lockSize?: boolean;
  shapeType?: "rect" | "polygon";
  polygonPoints?: Array<{ xIn: number; yIn: number }>;
  box: PrintAreaBox;
  rotationDeg?: number;
  maxWidthCm?: number;
  maxHeightCm?: number;
  dpi?: number;
  methods?: string[];
};

export type PlatformProduct = {
  _id: string;
  name: string;
  sku: string;
  slug?: string;
  category: string;
  subcategory?: string;
  childCategory?: string;
  /** All assigned category node IDs; first is primary. */
  categoryIds?: string[];
  /** Names along every assigned path — used for multi-category browse. */
  categoryLabels?: string[];
  brand?: string;
  description?: string;
  keyFeatures?: string;
  sizeGuide?: string;
  status: string;
  sellingPriceInr: number;
  costPriceInr: number;
  marginPct?: number;
  gstRate?: number;
  hsnCode?: string;
  moq?: number;
  material?: string;
  productionDays?: number;
  physicalDimensions?: PhysicalDimensions;
  dpi?: number;
  variants: ProductVariant[];
  imageUrls: string[];
  primaryImageUrl?: string;
  baseImageUrl?: string;
  maskImageUrl?: string;
  baseBackImageUrl?: string;
  maskBackImageUrl?: string;
  baseLeftImageUrl?: string;
  maskLeftImageUrl?: string;
  baseRightImageUrl?: string;
  maskRightImageUrl?: string;
  printAreas: PrintArea[];
  inventory?: { available?: number; mode?: string };
  source?: {
    provider?: string;
    domain?: string;
    externalId?: string;
    handle?: string;
    categoryAssignedByAdmin?: boolean;
  };
};

export type ProductInput = {
  name: string;
  category?: string;
  subcategory?: string;
  childCategory?: string;
  /** Ordered category placements; first ID is primary. */
  categoryIds?: string[];
  sellingPriceInr: number;
  costPriceInr?: number;
  brand?: string;
  description?: string;
  keyFeatures?: string;
  sizeGuide?: string;
  skuPrefix?: string;
  gstRate?: number;
  hsnCode?: string;
  moq?: number;
  material?: string;
  productionDays?: number;
  reason?: string;
};

export function getPlatformProduct(id: string) {
  return apiFetch<PlatformProduct>(`/platform/products/${id}`);
}

export function createProduct(body: ProductInput) {
  return apiFetch<PlatformProduct>("/platform/products", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateProduct(id: string, body: Partial<ProductInput>) {
  return apiFetch<PlatformProduct>(`/platform/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function addVariant(id: string, variant: ProductVariant) {
  return apiFetch<ProductVariant[]>(`/platform/products/${id}/variants`, {
    method: "POST",
    body: JSON.stringify(variant),
  });
}

export function updateVariant(id: string, variantId: string, patch: Partial<ProductVariant>) {
  return apiFetch<ProductVariant[]>(`/platform/products/${id}/variants/${variantId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export type ProductImageRole =
  | "base"
  | "mask"
  | "base_back"
  | "mask_back"
  | "base_left"
  | "mask_left"
  | "base_right"
  | "mask_right";

/** Upload a production image by view role (front / back / left / right). */
export function uploadProductImage(id: string, file: File, role: ProductImageRole) {
  const form = new FormData();
  form.append("images", file);
  form.append("role", role);
  return apiFetch<{
    baseImageUrl: string;
    maskImageUrl: string;
    baseBackImageUrl?: string;
    maskBackImageUrl?: string;
    baseLeftImageUrl?: string;
    maskLeftImageUrl?: string;
    baseRightImageUrl?: string;
    maskRightImageUrl?: string;
  }>(`/platform/products/${id}/images`, { method: "POST", body: form });
}

/**
 * Set a single role image (base/mask) by URL, without requiring file upload.
 * Used by the product wizard when the admin chooses a Shopify photo as a
 * temporary front mask fallback.
 */
export function setProductRoleImageByUrl(id: string, role: ProductImageRole, url: string) {
  const form = new FormData();
  form.append("role", role);
  // Backend accepts `req.body.urls` as either string or array.
  form.append("urls", url);
  return apiFetch<{
    baseImageUrl: string;
    maskImageUrl: string;
    baseBackImageUrl?: string;
    maskBackImageUrl?: string;
    baseLeftImageUrl?: string;
    maskLeftImageUrl?: string;
    baseRightImageUrl?: string;
    maskRightImageUrl?: string;
  }>(`/platform/products/${id}/images`, { method: "POST", body: form });
}

/** Drop non-positive inch fields so Zod `.positive()` does not reject legacy 0 defaults. */
function sanitizePrintAreaForSave(a: PrintArea): PrintArea {
  const next: PrintArea = { ...a };
  if (!(typeof next.widthIn === "number" && next.widthIn > 0)) delete (next as { widthIn?: number }).widthIn;
  if (!(typeof next.heightIn === "number" && next.heightIn > 0)) delete (next as { heightIn?: number }).heightIn;
  if (!(typeof next.scale === "number" && next.scale > 0)) delete (next as { scale?: number }).scale;
  return next;
}

export function setPrintAreas(
  id: string,
  printAreas: PrintArea[],
  extras?: { physicalDimensions?: PhysicalDimensions; dpi?: number },
) {
  return apiFetch<{
    printAreas: PrintArea[];
    physicalDimensions?: PhysicalDimensions;
    dpi?: number;
  }>(`/platform/products/${id}/print-areas`, {
    method: "PUT",
    body: JSON.stringify({
      printAreas: printAreas.map(sanitizePrintAreaForSave),
      ...(extras?.physicalDimensions ? { physicalDimensions: extras.physicalDimensions } : {}),
      ...(extras?.dpi != null ? { dpi: extras.dpi } : {}),
    }),
  });
}

export function publishProduct(id: string) {
  return apiFetch<PlatformProduct>(`/platform/products/${id}/publish`, { method: "POST" });
}

export function unpublishProduct(id: string) {
  return apiFetch<PlatformProduct>(`/platform/products/${id}/unpublish`, { method: "POST" });
}

export function archiveProduct(id: string) {
  return apiFetch<PlatformProduct>(`/platform/products/${id}/archive`, { method: "POST" });
}

export function moveProductToKit(id: string) {
  return apiFetch<{ product: PlatformProduct; kit: { _id: string } }>(
    `/platform/products/${id}/move-to-kit`,
    { method: "POST" },
  );
}

export function moveKitToCatalog(id: string) {
  return apiFetch<{ kit: { _id: string }; product: PlatformProduct }>(
    `/platform/kits/${id}/move-to-catalog`,
    { method: "POST" },
  );
}

export type PlatformCategory = {
  _id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "archived";
  parentId: string | null;
  depth?: number;
  sortOrder: number;
  children?: PlatformCategory[];
};

export function listCategories(query?: { parentId?: string; roots?: boolean }) {
  const params = new URLSearchParams();
  if (query?.parentId) params.set("parentId", query.parentId);
  if (query?.roots) params.set("roots", "1");
  const qs = params.toString();
  return apiFetch<PlatformCategory[]>(`/platform/categories${qs ? `?${qs}` : ""}`);
}

export function createCategory(body: {
  name: string;
  description?: string;
  parentId?: string | null;
  sortOrder?: number;
}) {
  return apiFetch<PlatformCategory>("/platform/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCategory(
  id: string,
  body: {
    name?: string;
    description?: string;
    parentId?: string | null;
    status?: "active" | "archived";
    sortOrder?: number;
  },
) {
  return apiFetch<PlatformCategory>(`/platform/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type ShopifyImportBreakdown = { imported: number; updated: number; skipped: number };

export type ShopifyImportSummary = {
  domain: string;
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Sorted into catalog products vs kit bundles. */
  products?: ShopifyImportBreakdown;
  kits?: ShopifyImportBreakdown;
  items: { title: string; status: string; reason?: string; kind?: "product" | "kit" }[];
};

export type ShopifyImportStatus = ShopifyImportSummary & {
  importJobId: string;
  status: "queued" | "processing" | "done" | "failed";
  error?: string;
};

type ShopifyImportStarted = { importJobId: string; status: "queued" };
type ShopifyImportOnStatus = (status: ShopifyImportStatus) => void;

export function startShopifyImport(domain: string, accessToken: string, signal?: AbortSignal) {
  return apiFetch<ShopifyImportStarted>("/platform/products/import/shopify", {
    method: "POST",
    body: JSON.stringify({ domain, accessToken }),
    signal,
  });
}

export function startShopifyKitsImport(domain: string, accessToken: string, signal?: AbortSignal) {
  return apiFetch<ShopifyImportStarted>("/platform/kits/import/shopify", {
    method: "POST",
    body: JSON.stringify({ domain, accessToken }),
    signal,
  });
}

export function fetchShopifyImportStatus(jobId: string, kits = false, signal?: AbortSignal) {
  return apiFetch<ShopifyImportStatus>(
    `/platform/${kits ? "kits" : "products"}/import/shopify/${encodeURIComponent(jobId)}/status`,
    { signal, cache: "no-store" },
  );
}

function waitForShopifyPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 1_000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** One GET at a time; brief gateway/network outages do not lose the running job. */
export async function pollShopifyImport(
  jobId: string,
  { kits = false, onStatus, signal }: { kits?: boolean; onStatus?: ShopifyImportOnStatus; signal?: AbortSignal } = {},
): Promise<ShopifyImportStatus> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeoutError = new Error(`Import status timed out after 30 minutes. The import may still be running (job ${jobId}).`);
  const timer = setTimeout(() => controller.abort(timeoutError), 30 * 60_000);
  try {
    while (true) {
      controller.signal.throwIfAborted();
      let status: ShopifyImportStatus;
      try {
        status = await fetchShopifyImportStatus(jobId, kits, controller.signal);
      } catch (err) {
        controller.signal.throwIfAborted();
        const code = err && typeof err === "object" && "status" in err ? Number(err.status) : 0;
        if (!(err instanceof TypeError) && ![502, 503, 504].includes(code)) throw err;
        await waitForShopifyPoll(controller.signal);
        continue;
      }
      controller.signal.throwIfAborted();
      onStatus?.(status);
      if (status.status === "done") return status;
      if (status.status === "failed") throw new Error(status.error || "Shopify import failed");
      await waitForShopifyPoll(controller.signal);
    }
  } catch (err) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function importShopify(domain: string, accessToken: string, onStatus?: ShopifyImportOnStatus, signal?: AbortSignal) {
  const { importJobId } = await startShopifyImport(domain, accessToken, signal);
  return pollShopifyImport(importJobId, { onStatus, signal });
}

/** Import only kit bundles from Shopify into the Kits collection. */
export async function importShopifyKits(domain: string, accessToken: string, onStatus?: ShopifyImportOnStatus, signal?: AbortSignal) {
  const { importJobId } = await startShopifyKitsImport(domain, accessToken, signal);
  return pollShopifyImport(importJobId, { kits: true, onStatus, signal });
}

// ---- Operations desk: status/action enums ----
export const ORDER_STATUSES = [
  "created", "approved", "mockup_pending", "mockup_approved", "in_production",
  "qc_pending", "packed", "shipped", "delivered", "issue_raised",
  "replacement_processing", "cancelled",
] as const;

export const SUPPORT_TICKET_STATUSES = [
  "open", "in_progress", "waiting_on_customer", "resolved", "closed",
] as const;

export const PRODUCTION_TASK_STATUSES = [
  "created", "material_pending", "mockup_pending", "mockup_approved", "in_production",
  "printing", "embroidery", "qc_pending", "packing", "ready_to_ship", "completed", "issue",
] as const;

export const SHIPMENT_STATUSES = [
  "pending", "packed", "shipped", "in_transit", "out_for_delivery",
  "delivered", "delayed", "rto", "lost", "damaged",
] as const;

// ---- Orders ----
export function fetchPlatformVendors(status = "active") {
  return apiFetch<Array<{ _id: string; name: string; type: string; status: string }>>(
    `/platform/vendors?status=${status}`,
  );
}
export function setOrderStatus(id: string, status: string, note?: string) {
  return apiFetch(`/platform/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, note: note ?? "" }) });
}
export function assignOrderVendor(id: string, vendorId: string) {
  return apiFetch(`/platform/orders/${id}/assign-vendor`, { method: "PATCH", body: JSON.stringify({ vendorId }) });
}
export function addOrderNote(id: string, body: string) {
  return apiFetch(`/platform/orders/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) });
}
export function uploadOrderMockup(id: string, url: string) {
  return apiFetch(`/platform/orders/${id}/mockup`, { method: "POST", body: JSON.stringify({ url }) });
}
export function createOrderReplacement(id: string, reason: string) {
  return apiFetch(`/platform/orders/${id}/replacement`, { method: "POST", body: JSON.stringify({ reason }) });
}

// ---- Support tickets ----
export function fetchPlatformTicket(id: string) {
  return apiFetch<Record<string, unknown>>(`/platform/support-tickets/${id}`);
}
export function setTicketStatus(id: string, status: string) {
  return apiFetch(`/platform/support-tickets/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}
export function assignTicket(id: string, userId: string) {
  return apiFetch(`/platform/support-tickets/${id}/assign`, { method: "PATCH", body: JSON.stringify({ userId }) });
}
export function addTicketMessage(id: string, body: string, internal = false) {
  return apiFetch(`/platform/support-tickets/${id}/messages`, { method: "POST", body: JSON.stringify({ body, internal }) });
}
export function resendRedemptionLink(id: string) {
  return apiFetch(`/platform/support-tickets/${id}/resend-redemption-link`, { method: "POST" });
}
export function resendTicketTracking(id: string) {
  return apiFetch(`/platform/support-tickets/${id}/resend-tracking-link`, { method: "POST" });
}

// ---- Production tasks ----
export function fetchProductionTasks(params?: { status?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  q.set("limit", String(params?.limit ?? 100));
  return apiFetch<Paginated<Record<string, unknown>>>(`/platform/production/tasks?${q}`);
}
export function setTaskStatus(id: string, status: string, note?: string) {
  return apiFetch(`/platform/production/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, note: note ?? "" }) });
}
export function recordTaskQc(id: string, passed: boolean, reason?: string, photoUrl?: string) {
  return apiFetch(`/platform/production/tasks/${id}/qc`, { method: "POST", body: JSON.stringify({ passed, reason: reason ?? "", photoUrl: photoUrl ?? "" }) });
}
export function createProductionTask(orderId: string, assignedTo?: string) {
  return apiFetch("/platform/production/tasks", { method: "POST", body: JSON.stringify({ orderId, assignedTo: assignedTo ?? "" }) });
}

// ---- Shipments ----
export function createShipment(body: { orderId: string; courier: string; awb: string; trackingUrl?: string }) {
  return apiFetch("/platform/shipments", { method: "POST", body: JSON.stringify(body) });
}
export function addShipmentEvent(id: string, body: { status: string; location?: string; note?: string }) {
  return apiFetch(`/platform/shipments/${id}/events`, { method: "POST", body: JSON.stringify(body) });
}
export function updateShipment(id: string, body: { courier?: string; awb?: string; trackingUrl?: string }) {
  return apiFetch(`/platform/shipments/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export function resendShipmentTracking(id: string) {
  return apiFetch(`/platform/shipments/${id}/resend-tracking`, { method: "POST" });
}
