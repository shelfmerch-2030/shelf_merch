/**
 * Merge.dev HRIS helpers — routes live at /api/integrations/merge (not /api/v1).
 */
import { ApiError } from "./api";
import { getAccessToken } from "./auth-store";

const MERGE_API_BASE = "/api/integrations/merge";

export const MERGE_HRIS_INTEGRATIONS = [
  "workday",
  "bamboohr",
  "gusto",
  "keka",
  "deel",
  "ukg-pro",
  "hibob",
] as const;

export type MergeHrisIntegration = (typeof MERGE_HRIS_INTEGRATIONS)[number];

export function isMergeHrisIntegration(id: string): id is MergeHrisIntegration {
  return (MERGE_HRIS_INTEGRATIONS as readonly string[]).includes(id);
}

export type MergeConnectionPublic = {
  id: string;
  provider: string;
  category: string;
  status: string;
  integrationName: string | null;
  endUserOrganizationName: string | null;
  mergeLinkedAccountId: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  lastError?: string | null;
  connectedByUserId: string | null;
  updatedAt: string | null;
};

export function mergeSyncErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code || "");
    if (code === "MERGE_SCOPES_DISABLED") {
      return "This HRIS connection is valid, but required Merge data scopes are disabled.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Merge sync failed";
}

export type MergeSyncCounts = {
  created: number;
  updated: number;
  unchanged?: number;
};

export type MergeSyncSummary = {
  employees: MergeSyncCounts;
  departments: MergeSyncCounts;
  locations: MergeSyncCounts;
  employments: MergeSyncCounts;
};

export type MergeHrisEmployeePublic = {
  id: string;
  connectionId: string;
  provider: string;
  mergeEmployeeId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  employmentStatus: string;
  jobTitle: string;
  employmentType?: string;
  departmentName?: string;
  country?: string;
  locationName?: string;
  departmentMergeIds: string[];
  locationMergeId: string | null;
  startDate: string | null;
  terminationDate: string | null;
  lastSyncedAt: string | null;
  source: string;
};

async function mergeFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${MERGE_API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const err =
      body && typeof body === "object" && body !== null && "error" in body
        ? (body as { error?: { message?: string; code?: string; details?: unknown } }).error
        : undefined;
    throw new ApiError(
      res.status,
      err?.message || res.statusText || "Merge request failed",
      err?.code || "MERGE_API_ERROR",
      err?.details,
    );
  }

  return body as T;
}

export async function createMergeLinkToken(options?: {
  integration?: MergeHrisIntegration;
}): Promise<string> {
  const payload =
    options?.integration != null ? { integration: options.integration } : {};
  const res = await mergeFetch<{ success: boolean; linkToken: string }>("/link-token", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res?.linkToken) {
    throw new ApiError(502, "Merge returned no link token", "MERGE_LINK_TOKEN_MISSING");
  }
  return res.linkToken;
}

export async function exchangeMergePublicToken(input: {
  publicToken: string;
  integration?: MergeHrisIntegration;
}): Promise<MergeConnectionPublic> {
  const res = await mergeFetch<{ success: boolean; connection: MergeConnectionPublic }>(
    "/exchange-token",
    {
      method: "POST",
      body: JSON.stringify({
        publicToken: input.publicToken,
        ...(input.integration ? { integration: input.integration } : {}),
      }),
    },
  );
  if (!res?.connection) {
    throw new ApiError(502, "Merge exchange returned no connection", "MERGE_EXCHANGE_INVALID");
  }
  return res.connection;
}

export async function fetchMergeConnections(): Promise<MergeConnectionPublic[]> {
  const res = await mergeFetch<{ success: boolean; connections: MergeConnectionPublic[] }>(
    "/connections",
  );
  return Array.isArray(res?.connections) ? res.connections : [];
}

export async function syncMergeConnection(connectionId: string): Promise<{
  connection: MergeConnectionPublic;
  sync: MergeSyncSummary;
}> {
  const res = await mergeFetch<{
    success: boolean;
    connection: MergeConnectionPublic;
    sync: MergeSyncSummary;
  }>(`/connections/${encodeURIComponent(connectionId)}/sync`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res?.connection || !res?.sync) {
    throw new ApiError(502, "Merge sync returned an incomplete response", "MERGE_SYNC_INVALID");
  }
  return { connection: res.connection, sync: res.sync };
}

export async function disconnectMergeConnection(
  connectionId: string,
): Promise<MergeConnectionPublic> {
  const res = await mergeFetch<{ success: boolean; connection: MergeConnectionPublic }>(
    `/connections/${encodeURIComponent(connectionId)}/disconnect`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  if (!res?.connection) {
    throw new ApiError(
      502,
      "Merge disconnect returned no connection",
      "MERGE_DISCONNECT_INVALID",
    );
  }
  return res.connection;
}

export async function fetchMergeEmployees(options?: {
  connectionId?: string;
  limit?: number;
}): Promise<MergeHrisEmployeePublic[]> {
  const params = new URLSearchParams();
  if (options?.connectionId) params.set("connectionId", options.connectionId);
  if (options?.limit != null) params.set("limit", String(options.limit));
  const qs = params.toString();
  const res = await mergeFetch<{ success: boolean; employees: MergeHrisEmployeePublic[] }>(
    `/employees${qs ? `?${qs}` : ""}`,
  );
  return Array.isArray(res?.employees) ? res.employees : [];
}
