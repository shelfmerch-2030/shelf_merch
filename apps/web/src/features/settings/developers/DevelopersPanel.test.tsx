/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/services/developers-api";
import { DevelopersPanel } from "./DevelopersPanel";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/catalog-match-api", () => ({
  tenantCatalogMatch: () => ({ listRuns: async () => [], listConnections: async () => [] }),
}));
vi.mock("@/services/developers-api", () => ({
  getDevelopersOverview: vi.fn(),
  listApiKeys: vi.fn(),
  listTenantSkuMappings: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  saveTenantSkuMapping: vi.fn(),
  deleteTenantSkuMapping: vi.fn(),
  searchTenantCatalog: vi.fn(),
  getTenantCatalogProduct: vi.fn(),
  updateWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  revealWebhookSecret: vi.fn(),
  rotateWebhookSecret: vi.fn(),
  sendWebhookTest: vi.fn(),
  listWebhookDeliveries: vi.fn(),
  getWebhookDelivery: vi.fn(),
  getCatalogImports: vi.fn(),
  resendWebhookDelivery: vi.fn(),
}));

const key: api.ApiKeyRow = {
  id: "k1",
  name: "Website",
  mode: "live",
  prefix: "smk_live_0123456789abcdef_…a1b2",
  scopes: ["orders:write", "orders:read", "products:read"],
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-11-24T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(api.getDevelopersOverview).mockResolvedValue({ apiBaseUrl: "https://x/api/public/v1", docsUrl: "https://x/docs/api", scopes: [] });
  vi.mocked(api.listApiKeys).mockResolvedValue([key]);
  vi.mocked(api.listTenantSkuMappings).mockResolvedValue([]);
  vi.mocked(api.listWebhooks).mockResolvedValue({ items: [], eventTypes: ["order.shipped"] });
  vi.mocked(api.getCatalogImports).mockResolvedValue({ importedCount: 0, imports: [] });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("DevelopersPanel", () => {
  it("lists keys by prefix only and shows a new key exactly once", async () => {
    vi.mocked(api.createApiKey).mockResolvedValue({ apiKey: { ...key, id: "k2", name: "ERP", mode: "test" }, token: "smk_test_aaaa_bbbb" });
    render(<DevelopersPanel canWrite />);
    expect(await screen.findByText("smk_live_0123456789abcdef_…a1b2")).toBeTruthy();
    expect(screen.getByText("https://x/api/public/v1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "ERP" } });
    const createButtons = screen.getAllByRole("button", { name: "Create key" });
    fireEvent.click(createButtons[createButtons.length - 1]);

    await waitFor(() =>
      expect(api.createApiKey).toHaveBeenCalledWith({
        name: "ERP",
        mode: "test",
        scopes: ["orders:write", "orders:read", "products:read", "sku_mappings:read", "sku_mappings:write", "catalog:read", "catalog:import"],
      }),
    );
    expect(await screen.findByText("smk_test_aaaa_bbbb")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I've saved it" }));
    await waitFor(() => expect(screen.queryByText("smk_test_aaaa_bbbb")).toBeNull());
  });

  it("explains access to non-admins without loading keys", () => {
    render(<DevelopersPanel canWrite={false} />);
    expect(screen.getByText("Only company admins can manage API access.")).toBeTruthy();
    expect(api.listApiKeys).not.toHaveBeenCalled();
  });
});
