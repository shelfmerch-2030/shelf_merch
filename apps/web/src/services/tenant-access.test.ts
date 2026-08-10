import { describe, it, expect } from "vitest";
import {
  canAccessTenantArea,
  navItemsForTenantRole,
  rolesForTenantArea,
} from "@/services/tenant-access";

describe("tenant-access", () => {
  it("allows company_admin write on shops and wallets", () => {
    expect(canAccessTenantArea("company_admin", "shops", "write")).toBe(true);
    expect(canAccessTenantArea("company_admin", "wallets", "write")).toBe(true);
    expect(canAccessTenantArea("entity_manager", "shops", "write")).toBe(false);
    expect(canAccessTenantArea("entity_manager", "shops", "read")).toBe(true);
  });

  it("lets both roles operate campaignOps but only admin manage users", () => {
    expect(canAccessTenantArea("entity_manager", "campaignOps", "write")).toBe(true);
    expect(canAccessTenantArea("entity_manager", "users", "read")).toBe(false);
    expect(canAccessTenantArea("company_admin", "users", "write")).toBe(true);
  });

  it("always includes platform_super_admin in role lists", () => {
    expect(rolesForTenantArea("catalog", "read")).toContain("platform_super_admin");
  });

  it("filters nav items by role", () => {
    const managerNav = navItemsForTenantRole("entity_manager").map((i) => i.key);
    expect(managerNav).toContain("campaigns");
    expect(managerNav).toContain("shops");
    expect(managerNav).not.toContain("users");

    expect(navItemsForTenantRole(undefined)).toEqual([]);
  });
});
