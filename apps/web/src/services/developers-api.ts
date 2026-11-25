import { apiFetch } from "./api";

/** Tenant self-serve API access (company admins): keys, webhooks, tenant-wide SKU mappings. */

export type ApiKeyMode = "live" | "test";
export type ApiKeyScope = "orders:read" | "orders:write" | "products:read" | "sku_mappings:read" | "sku_mappings:write";

export type ApiKeyRow = {
  id: string;
  name: string;
  mode: ApiKeyMode;
  prefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type DevelopersOverview = { apiBaseUrl: string; docsUrl: string; scopes: ApiKeyScope[] };

export type WebhookEndpoint = {
  id: string;
  url: string;
  description: string;
  mode: ApiKeyMode;
  events: string[];
  enabled: boolean;
  consecutiveFailures: number;
  failingSince: string | null;
  disabledAt: string | null;
  disabledReason: string;
  lastSuccessAt: string | null;
  createdAt: string;
};

export type WebhookDelivery = {
  _id: string;
  eventPublicId: string;
  eventType: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  responseStatus: number | null;
  responseSnippet: string;
  durationMs: number | null;
  error: string;
  createdAt: string;
};

export type TenantSkuMapping = {
  _id: string;
  externalSku: string;
  catalogProductId: string;
  variant: { size: string; color: string };
  artworkUrl: string;
  product: { name: string; sku: string } | null;
};

const base = "/developers";

export const getDevelopersOverview = () => apiFetch<DevelopersOverview>(`${base}/overview`);

export async function listApiKeys(includeRevoked = false) {
  return (await apiFetch<{ items: ApiKeyRow[] }>(`${base}/keys${includeRevoked ? "?includeRevoked=true" : ""}`)).items;
}

/** The returned `token` is shown once and cannot be fetched again. */
export const createApiKey = (body: { name: string; mode: ApiKeyMode; scopes?: ApiKeyScope[] }) =>
  apiFetch<{ apiKey: ApiKeyRow; token: string }>(`${base}/keys`, { method: "POST", body: JSON.stringify(body) });

export const revokeApiKey = (id: string) => apiFetch<ApiKeyRow>(`${base}/keys/${id}`, { method: "DELETE" });

export async function listWebhooks() {
  return apiFetch<{ items: WebhookEndpoint[]; eventTypes: string[] }>(`${base}/webhooks`);
}

/** The returned `secret` is shown on creation; it can be revealed again later by an admin. */
export const createWebhook = (body: { url: string; mode: ApiKeyMode; events?: string[]; description?: string }) =>
  apiFetch<{ endpoint: WebhookEndpoint; secret: string }>(`${base}/webhooks`, { method: "POST", body: JSON.stringify(body) });

export const updateWebhook = (id: string, patch: Partial<{ url: string; events: string[]; description: string; enabled: boolean }>) =>
  apiFetch<WebhookEndpoint>(`${base}/webhooks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const deleteWebhook = (id: string) => apiFetch(`${base}/webhooks/${id}`, { method: "DELETE" });
export const revealWebhookSecret = (id: string) =>
  apiFetch<{ secret: string }>(`${base}/webhooks/${id}/reveal-secret`, { method: "POST" });
export const rotateWebhookSecret = (id: string) =>
  apiFetch<{ secret: string }>(`${base}/webhooks/${id}/rotate-secret`, { method: "POST" });
export const sendWebhookTest = (id: string) => apiFetch<WebhookDelivery>(`${base}/webhooks/${id}/test`, { method: "POST" });

export const listWebhookDeliveries = (id: string, page = 1) =>
  apiFetch<{ items: WebhookDelivery[]; total: number; page: number; limit: number }>(
    `${base}/webhooks/${id}/deliveries?page=${page}&limit=20`,
  );
export const getWebhookDelivery = (deliveryId: string) =>
  apiFetch<{ delivery: WebhookDelivery; payload: unknown }>(`${base}/webhook-deliveries/${deliveryId}`);
export const resendWebhookDelivery = (deliveryId: string) =>
  apiFetch<WebhookDelivery>(`${base}/webhook-deliveries/${deliveryId}/resend`, { method: "POST" });

export async function listTenantSkuMappings() {
  return (await apiFetch<{ items: TenantSkuMapping[] }>(`${base}/sku-mappings`)).items;
}

export const saveTenantSkuMapping = (body: {
  externalSku: string;
  catalogProductId: string;
  variant?: { size?: string; color?: string };
  artworkUrl?: string;
}) => apiFetch<TenantSkuMapping>(`${base}/sku-mappings`, { method: "PUT", body: JSON.stringify(body) });

export const deleteTenantSkuMapping = (id: string) => apiFetch(`${base}/sku-mappings/${id}`, { method: "DELETE" });

export type TenantCatalogProduct = {
  _id: string;
  name: string;
  sku: string;
  variants?: { size?: string; color?: string; sku?: string }[];
};

export const getTenantCatalogProduct = (id: string) => apiFetch<TenantCatalogProduct>(`/catalog/products/${id}`);

export async function searchTenantCatalog(search: string) {
  const q = new URLSearchParams({ search, limit: "20" });
  return (await apiFetch<{ items: TenantCatalogProduct[] }>(`/catalog/products?${q.toString()}`)).items;
}
