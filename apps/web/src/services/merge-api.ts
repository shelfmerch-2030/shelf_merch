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
  "google-workspace",
] as const;

export const MERGE_DIRECTORY_PROVIDERS = ["google-workspace"] as const;

export function isMergeDirectoryProvider(id: string): boolean {
  return (MERGE_DIRECTORY_PROVIDERS as readonly string[]).includes(id);
}

export type MergeHrisIntegration = (typeof MERGE_HRIS_INTEGRATIONS)[number];

export function isMergeHrisIntegration(id: string): id is MergeHrisIntegration {
  return (MERGE_HRIS_INTEGRATIONS as readonly string[]).includes(id);
}

export type MergeCommonModelSyncPublic = {
  modelId: string | null;
  status: string | null;
  lastSyncResult: string | null;
  lastSyncStart: string | null;
  lastSyncFinished: string | null;
  dataFreshAsOf: string | null;
  syncStatusReason: string | null;
  isInitialSync: boolean | null;
};

export type MergeModelSyncPublic = {
  employee: MergeCommonModelSyncPublic | null;
  employment: MergeCommonModelSyncPublic | null;
  group: MergeCommonModelSyncPublic | null;
  location: MergeCommonModelSyncPublic | null;
  fetchedAt: string | null;
  listComplete: boolean;
};

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
  mergeModelSync?: MergeModelSyncPublic | null;
};

export function mergeSafeErrorMessage(
  code: string | null | undefined,
  providerName = "your HRMS",
): string | null {
  switch (code) {
    case "MERGE_AUTH_FAILED":
      return `ShelfMerch can no longer fully access employee data from ${providerName}. Reconnect your account to restore automatic syncing.`;
    case "MERGE_SCOPES_DISABLED":
      return "Employee access is not enabled for this connection. Reconnect or update your HRMS permissions so ShelfMerch can access employees.";
    case "MERGE_OPTIONAL_SCOPE_DISABLED":
      return "Connected with limited access. Some optional HRMS data is unavailable, but employee syncing is still working.";
    case "MERGE_RATE_LIMITED":
    case "MERGE_UNREACHABLE":
    case "MERGE_UPSTREAM_ERROR":
    case "MERGE_SYNC_LOCK_LOST":
      return "Latest sync could not complete. Your HRMS connection is still active and ShelfMerch will retry automatically.";
    case "MERGE_QUEUE_UNAVAILABLE":
      return "Sync could not be started right now. Please try again shortly.";
    case "MERGE_SYNC_STALE":
      return "A previous sync stopped unexpectedly. You can try syncing again. Automatic syncing will continue.";
    default:
      return code ? "The latest sync could not complete." : null;
  }
}

export function mergeSyncErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code || "");
    if (code === "MERGE_SYNC_IN_PROGRESS" || code === "MERGE_SYNC_LOCK_LOST") {
      return "Sync already in progress";
    }
    if (code === "MERGE_PROVIDER_ERROR") {
      return "The provider could not complete sync. Try again.";
    }
    if (code.startsWith("MERGE_")) {
      return mergeSafeErrorMessage(code) || "The latest sync could not complete.";
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
  contacts?: MergeSyncCounts;
};

export type MergeHrisEmployeePublic = {
  id: string;
  connectionId: string;
  connectionStatus?: "connected" | "needs_attention" | "disconnected" | string;
  provider: string;
  mergeEmployeeId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  employmentStatus: string;
  effectiveEmploymentStatus?: string;
  effectiveStatusSource?: "merge_status" | "termination_date" | "rehire" | string;
  jobTitle: string;
  employmentType?: string;
  departmentName?: string;
  /** Compact work/location address from synced MergeHrisLocation fields. */
  address?: string;
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

export type MergeSyncEnqueueResult = {
  queued: boolean;
  alreadyQueuedOrRunning: boolean;
  connectionId: string;
  jobId: string;
  syncStatus: string;
};

export async function syncMergeConnection(connectionId: string): Promise<MergeSyncEnqueueResult> {
  const res = await mergeFetch<{
    success: boolean;
    queued?: boolean;
    alreadyQueuedOrRunning?: boolean;
    connectionId?: string;
    jobId?: string;
    syncStatus?: string;
  }>(`/connections/${encodeURIComponent(connectionId)}/sync`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return {
    queued: res?.queued === true,
    alreadyQueuedOrRunning: res?.alreadyQueuedOrRunning === true,
    connectionId: res?.connectionId || connectionId,
    jobId: res?.jobId || "",
    syncStatus: res?.syncStatus || "",
  };
}

export type MergeSyncRunModelProgress = {
  status: string;
  pagesProcessed: number;
  recordsProcessed: number;
  lastPageCompletedAt?: string | null;
  errorCode?: string | null;
};

export type MergeSyncRunPublic = {
  id: string;
  connectionId: string;
  reason: string;
  mode?: string | null;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastProgressAt?: string | null;
  durationMs?: number | null;
  retryCount: number;
  workerAttempt: number;
  rateLimitCount: number;
  errorCode?: string | null;
  failedModel?: string | null;
  models: {
    employee: MergeSyncRunModelProgress | null;
    employment: MergeSyncRunModelProgress | null;
    group: MergeSyncRunModelProgress | null;
    location: MergeSyncRunModelProgress | null;
    contact: MergeSyncRunModelProgress | null;
  };
};

export type MergeSyncStatusPublic = {
  connectionId: string;
  connectionStatus: string;
  lastSyncStatus: string;
  lastSyncAt?: string | null;
  lastSyncRequestedAt?: string | null;
  lastSyncStartedAt?: string | null;
  lastSyncFinishedAt?: string | null;
  lastFullSyncAt?: string | null;
  lastError?: string | null;
  activeRun: MergeSyncRunPublic | null;
  runs: MergeSyncRunPublic[];
};

export async function fetchMergeSyncStatus(connectionId: string): Promise<MergeSyncStatusPublic> {
  const res = await mergeFetch<MergeSyncStatusPublic & { success: boolean }>(
    `/connections/${encodeURIComponent(connectionId)}/sync-runs`,
  );
  return {
    connectionId: res.connectionId,
    connectionStatus: res.connectionStatus,
    lastSyncStatus: res.lastSyncStatus,
    lastSyncAt: res.lastSyncAt ?? null,
    lastSyncRequestedAt: res.lastSyncRequestedAt ?? null,
    lastSyncStartedAt: res.lastSyncStartedAt ?? null,
    lastSyncFinishedAt: res.lastSyncFinishedAt ?? null,
    lastFullSyncAt: res.lastFullSyncAt ?? null,
    lastError: res.lastError ?? null,
    activeRun: res.activeRun ?? null,
    runs: Array.isArray(res.runs) ? res.runs : [],
  };
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
