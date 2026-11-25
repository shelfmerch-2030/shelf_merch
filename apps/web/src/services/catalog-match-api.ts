import { apiFetch } from "./api";

/**
 * Bulk catalog matching: compare a client's catalog (CSV/XLSX, or a client API) with ShelfMerch's and
 * create SKU mappings by confidence. Mounted for clients at /developers/catalog-match (tenant-wide, CSV)
 * and for ShelfMerch ops at /platform/catalog-match (any tenant, CSV or client API).
 */

export type MatchStatus =
  | "auto_mapped"
  | "review"
  | "no_match"
  | "already_mapped"
  | "accepted"
  | "rejected"
  | "undone"
  | "invalid";

export type MatchCounts = {
  scanned: number;
  autoMapped: number;
  review: number;
  noMatch: number;
  alreadyMapped: number;
  invalid: number;
};

export type MatchRun = {
  _id: string;
  connectionId: string | null;
  source: "csv" | "custom_api";
  fileName: string;
  status: "running" | "completed" | "failed";
  counts: MatchCounts;
  error: string;
  startedAt: string;
  finishedAt: string | null;
  undoneAt: string | null;
  createdAt: string;
};

export type MatchCandidate = {
  catalogProductId: string;
  name: string;
  sku: string;
  score: number;
  reasons: string[];
  variant: { size: string; color: string; sku: string } | null;
  variantOk: boolean;
};

export type MatchItem = {
  _id: string;
  row: number;
  client: {
    sku: string;
    barcode: string;
    name: string;
    brand: string;
    model: string;
    category: string;
    size: string;
    color: string;
    material: string;
    imageUrl: string;
  };
  status: MatchStatus;
  bestScore: number;
  reviewReason: string;
  candidates: MatchCandidate[];
  mappingId: string | null;
  decidedAt: string | null;
};

export type CatalogConnection = { _id: string; name: string; shopDomain: string; productsPath: string };

export type CatalogMatchClient = ReturnType<typeof catalogMatchClient>;

/** `scope` is appended to every request (the platform mount needs `tenantId`). */
export function catalogMatchClient(base: string, scope: Record<string, string> = {}) {
  const url = (path: string, query: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams(scope);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") q.set(k, String(v));
    const qs = q.toString();
    return `${base}${path}${qs ? `?${qs}` : ""}`;
  };
  const post = <T,>(path: string, body?: unknown) =>
    apiFetch<T>(url(path), { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    listRuns: async () => (await apiFetch<{ items: MatchRun[] }>(url("/runs"))).items,
    getRun: (id: string) => apiFetch<MatchRun>(url(`/runs/${id}`)),
    listItems: (id: string, query: { status?: string; page?: number; limit?: number } = {}) =>
      apiFetch<{ items: MatchItem[]; total: number; page: number; limit: number }>(url(`/runs/${id}/items`, query)),
    uploadFile: (file: File) => {
      const form = new FormData();
      form.append("source", "csv");
      for (const [k, v] of Object.entries(scope)) form.append(k, v);
      form.append("file", file);
      return apiFetch<MatchRun>(url("/runs"), { method: "POST", body: form });
    },
    runFromConnection: (connectionId: string) => post<MatchRun>("/runs", { source: "custom_api", connectionId }),
    listConnections: async () => (await apiFetch<{ items: CatalogConnection[] }>(url("/connections"))).items,
    acceptSuggestions: (id: string, minScore?: number) =>
      post<{ accepted: number; skipped: number }>(`/runs/${id}/accept-suggestions`, minScore === undefined ? {} : { minScore }),
    undoRun: (id: string) => post<{ removedMappings: number }>(`/runs/${id}/undo`),
    acceptItem: (id: string, body: { catalogProductId?: string; variant?: { size: string; color: string } | null } = {}) =>
      post<MatchItem>(`/items/${id}/accept`, body),
    rejectItem: (id: string) => post<MatchItem>(`/items/${id}/reject`),
  };
}

export const tenantCatalogMatch = () => catalogMatchClient("/developers/catalog-match");
export const platformCatalogMatch = (tenantId: string) => catalogMatchClient("/platform/catalog-match", { tenantId });
