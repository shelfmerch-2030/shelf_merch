import { describe, it, expect, beforeEach } from "vitest";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  isAuthenticated,
  isPlatformUser,
  setSession,
  type AuthUser,
} from "@/services/auth-store";

const user: AuthUser = {
  id: "u1",
  tenantId: "t1",
  name: "Priya",
  email: "priya@rubix.net",
  role: "entity_manager",
  scopeType: "entity",
  assignedEntityIds: ["e1"],
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("auth-store", () => {
  it("persists and clears session tokens + user", () => {
    expect(isAuthenticated()).toBe(false);

    setSession({
      accessToken: "access",
      refreshToken: "refresh",
      user,
    });

    expect(getAccessToken()).toBe("access");
    expect(getRefreshToken()).toBeNull();
    expect(localStorage.getItem("sm_refresh")).toBeNull();
    expect(getStoredUser()).toEqual(user);
    expect(isAuthenticated()).toBe(true);

    clearSession();
    expect(getAccessToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it("returns null for corrupt stored user JSON", () => {
    localStorage.setItem("sm_user", "{not-json");
    expect(getStoredUser()).toBeNull();
  });

  it("migrates an existing sessionStorage session into localStorage", () => {
    sessionStorage.setItem("sm_access", "legacy-access");
    sessionStorage.setItem("sm_refresh", "legacy-refresh");
    sessionStorage.setItem("sm_user", JSON.stringify(user));

    expect(getAccessToken()).toBe("legacy-access");
    expect(getRefreshToken()).toBeNull();
    expect(localStorage.getItem("sm_refresh")).toBeNull();
    expect(sessionStorage.getItem("sm_refresh")).toBeNull();
    expect(getStoredUser()).toEqual(user);
    expect(localStorage.getItem("sm_access")).toBe("legacy-access");
    expect(sessionStorage.getItem("sm_access")).toBeNull();
  });

  it("detects platform users by scope or role prefix", () => {
    expect(isPlatformUser(null)).toBe(false);
    expect(isPlatformUser(user)).toBe(false);
    expect(
      isPlatformUser({
        ...user,
        role: "platform_ops_admin",
        scopeType: "platform",
        tenantId: null,
      }),
    ).toBe(true);
    expect(
      isPlatformUser({
        ...user,
        role: "platform_catalog_admin",
        scopeType: "tenant",
      }),
    ).toBe(true);
  });
});
