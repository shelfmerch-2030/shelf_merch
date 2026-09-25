export type AuthUser = {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  role: string;
  scopeType: string;
  assignedEntityIds: string[];
};

const ACCESS_KEY = "sm_access";
const REFRESH_KEY = "sm_refresh";
const USER_KEY = "sm_user";

function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sm:auth-change"));
  }
}

/** Prefer localStorage so auth is shared across tabs (e.g. Catalog opened in a new tab). */
function readAuthItem(key: string): string | null {
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal != null) return fromLocal;
    // Migrate any in-flight sessionStorage session from before this change.
    const fromSession = sessionStorage.getItem(key);
    if (fromSession != null) {
      localStorage.setItem(key, fromSession);
      sessionStorage.removeItem(key);
      return fromSession;
    }
    return null;
  } catch {
    return null;
  }
}

function writeAuthItem(key: string, value: string) {
  localStorage.setItem(key, value);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function removeAuthItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getAccessToken(): string | null {
  return readAuthItem(ACCESS_KEY);
}

/**
 * Refresh tokens live in an HttpOnly cookie. Drop any legacy copy that older
 * builds wrote into web storage so page scripts cannot read it.
 */
export function getRefreshToken(): string | null {
  removeAuthItem(REFRESH_KEY);
  return null;
}

export function getStoredUser(): AuthUser | null {
  const raw = readAuthItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(tokens: {
  accessToken: string;
  user: AuthUser;
  /** Ignored. Kept so older callers compile; the cookie holds the refresh token. */
  refreshToken?: string;
}) {
  writeAuthItem(ACCESS_KEY, tokens.accessToken);
  removeAuthItem(REFRESH_KEY);
  writeAuthItem(USER_KEY, JSON.stringify(tokens.user));
  notifyAuthChange();
}

export function clearSession() {
  removeAuthItem(ACCESS_KEY);
  removeAuthItem(REFRESH_KEY);
  removeAuthItem(USER_KEY);
  notifyAuthChange();
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken() && getStoredUser());
}

export function isPlatformUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.scopeType === "platform" || Boolean(user.role?.startsWith("platform_"));
}
