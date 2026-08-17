import { formatErrorDetails } from "@/lib/errorMessage";
import { API_BASE } from "./config";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setSession,
  type AuthUser,
} from "./auth-store";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = "API_ERROR", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = RequestInit & {
  auth?: boolean;
  idempotencyKey?: string;
};

let refreshPromise: Promise<boolean> | null = null;

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorFromResponse(status: number, body: unknown): ApiError {
  const apiError =
    body && typeof body === "object" && "error" in body
      ? (
          body as {
            error: {
              message?: string;
              code?: string;
              details?: unknown;
            };
          }
        ).error
      : null;

  // Prefer the API's own message when present (e.g. RAZORPAY_NOT_CONFIGURED).
  // Only use the generic gateway copy when the proxy/upstream returned an empty body.
  if ((status === 502 || status === 503 || status === 504) && !apiError?.message) {
    return new ApiError(
      status,
      "Server temporarily unavailable - wait a moment and try again",
      "GATEWAY_ERROR",
      body,
    );
  }

  if (apiError) {
    let message = apiError.message || "Request failed";
    const detailMessages = formatErrorDetails(apiError.details);
    if (detailMessages.length) {
      message = `${message}: ${detailMessages.join("; ")}`;
    }
    return new ApiError(status, message, apiError.code || "API_ERROR", body);
  }
  return new ApiError(status, typeof body === "string" && body.trim() ? body : "Request failed");
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    clearSession();
    return false;
  }

  const data = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  };
  setSession(data);
  return true;
}

async function ensureRefreshed(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { auth = true, idempotencyKey, headers: extraHeaders, ...init } = options;
  const headers = new Headers(extraHeaders);

  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  let res = await fetch(url, { ...init, headers });

  if (res.status === 401 && auth && getRefreshToken()) {
    const refreshed = await ensureRefreshed();
    if (refreshed) {
      const retryHeaders = new Headers(headers);
      const token = getAccessToken();
      if (token) retryHeaders.set("Authorization", `Bearer ${token}`);
      res = await fetch(url, { ...init, headers: retryHeaders });
    }
  }

  const body = await parseBody(res);
  if (!res.ok) throw errorFromResponse(res.status, body);
  return body as T;
}

/** Public redemption routes - no auth header. */
export async function publicFetch<T = unknown>(
  path: string,
  init: Omit<RequestOptions, "auth"> = {},
): Promise<T> {
  return apiFetch<T>(path, { ...init, auth: false });
}
