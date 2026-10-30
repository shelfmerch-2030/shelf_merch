import { describe, expect, it } from "vitest";
import { permissionLines, READ_PERMISSION_LABELS } from "./consentPermissions";

const READ_SCOPES = [
  "catalog:read",
  "orders:read",
  "campaigns:read",
  "wallets:read",
  "employees:read",
  "gifts:read",
];

describe("permissionLines", () => {
  it("shows the six read permissions and hides offline_access", () => {
    const lines = permissionLines(`${READ_SCOPES.join(" ")} offline_access openid`);
    expect(lines).toEqual(READ_SCOPES.map((scope) => READ_PERMISSION_LABELS[scope]));
    expect(lines.join(" ")).not.toContain("offline_access");
    expect(lines.join(" ")).not.toContain("openid");
  });

  it("keeps a catalog-only grant on the catalog permission", () => {
    expect(permissionLines("catalog:read")).toEqual([READ_PERMISSION_LABELS["catalog:read"]]);
  });
});
