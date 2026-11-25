/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogMatchClient, MatchItem, MatchRun } from "@/services/catalog-match-api";
import { CatalogMatchPanel } from "./CatalogMatchPanel";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const run: MatchRun = {
  _id: "r1",
  connectionId: null,
  source: "csv",
  fileName: "catalog.csv",
  status: "completed",
  counts: { scanned: 1000, autoMapped: 800, review: 150, noMatch: 50, alreadyMapped: 0, invalid: 0 },
  error: "",
  startedAt: "2026-11-25T10:00:00Z",
  finishedAt: "2026-11-25T10:00:05Z",
  undoneAt: null,
  createdAt: "2026-11-25T10:00:00Z",
};

const hoodie: MatchItem = {
  _id: "i1",
  row: 5,
  client: { sku: "C-5", barcode: "", name: "Classic Hoodie", brand: "ShelfWear", model: "", category: "", size: "", color: "", material: "", imageUrl: "" },
  status: "review",
  bestScore: 0.82,
  reviewReason: "two products are equally likely",
  candidates: [
    { catalogProductId: "p1", name: "Classic Pullover Hoodie", sku: "HD-200", score: 0.82, reasons: ["name 80%", "same brand"], variant: null, variantOk: true },
    { catalogProductId: "p2", name: "Classic Zip Hoodie", sku: "HD-201", score: 0.8, reasons: ["name 78%", "same brand"], variant: null, variantOk: true },
  ],
  mappingId: null,
  decidedAt: null,
};

function fakeClient(overrides: Partial<CatalogMatchClient> = {}): CatalogMatchClient {
  return {
    listRuns: vi.fn(async () => [run]),
    getRun: vi.fn(),
    listItems: vi.fn(async () => ({ items: [hoodie], total: 1, page: 1, limit: 50 })),
    uploadFile: vi.fn(async () => run),
    runFromConnection: vi.fn(async () => ({ ...run, source: "custom_api" as const })),
    listConnections: vi.fn(async () => []),
    acceptSuggestions: vi.fn(async () => ({ accepted: 120, skipped: 30 })),
    undoRun: vi.fn(async () => ({ removedMappings: 800 })),
    acceptItem: vi.fn(async () => ({ ...hoodie, status: "accepted" as const })),
    rejectItem: vi.fn(async () => ({ ...hoodie, status: "rejected" as const })),
    ...overrides,
  } as CatalogMatchClient;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CatalogMatchPanel", () => {
  it("shows the report and opens on the review queue", async () => {
    const client = fakeClient();
    render(<CatalogMatchPanel client={client} searchProducts={async () => []} />);
    const tiles = await screen.findByRole("tablist");
    for (const [n, label] of [["1,000", "Scanned"], ["800", "Auto-mapped"], ["150", "Needs review"], ["50", "No match"]]) {
      const tile = within(tiles).getByText(label).closest("button")!;
      expect(tile.textContent).toContain(n);
    }
    await screen.findByText("Classic Hoodie");
    expect(client.listItems).toHaveBeenCalledWith("r1", expect.objectContaining({ status: "review" }));
    expect(screen.getByText("two products are equally likely")).toBeTruthy();
  });

  it("accepts the candidate the reviewer picks", async () => {
    const client = fakeClient();
    render(<CatalogMatchPanel client={client} searchProducts={async () => []} />);
    const select = await screen.findByLabelText("Candidates for C-5");
    fireEvent.change(select, { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(client.acceptItem).toHaveBeenCalledWith("i1", { catalogProductId: "p2" }));
  });

  it("maps to any product found by search", async () => {
    const client = fakeClient();
    const search = vi.fn(async () => [{ _id: "p9", name: "Heavy Fleece Hoodie", sku: "HD-900" }]);
    render(<CatalogMatchPanel client={client} searchProducts={search} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pick other" }));
    fireEvent.change(screen.getByPlaceholderText("Search ShelfMerch products…"), { target: { value: "fleece" } });
    fireEvent.click(await screen.findByRole("button", { name: /Heavy Fleece Hoodie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(client.acceptItem).toHaveBeenCalledWith("i1", { catalogProductId: "p9" }));
  });

  it("uploads a file and offers a client API only when one is configured", async () => {
    const onMappingsChanged = vi.fn();
    const client = fakeClient({ listConnections: vi.fn(async () => [{ _id: "c1", name: "Client API", shopDomain: "api.client.example", productsPath: "/products" }]) });
    render(<CatalogMatchPanel client={client} searchProducts={async () => []} allowApiSource onMappingsChanged={onMappingsChanged} />);
    const file = new File(["sku,name\nA,Tee"], "catalog.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Catalog file"), { target: { files: [file] } });
    await waitFor(() => expect(client.uploadFile).toHaveBeenCalledWith(file));
    await waitFor(() => expect(onMappingsChanged).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: "Fetch & match" }));
    await waitFor(() => expect(client.runFromConnection).toHaveBeenCalledWith("c1"));
  });

  it("hides write actions for read-only users", async () => {
    render(<CatalogMatchPanel client={fakeClient()} searchProducts={async () => []} canWrite={false} />);
    await screen.findByText("Classic Hoodie");
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByLabelText("Catalog file")).toBeNull();
    expect(screen.queryByRole("button", { name: "Accept all suggestions" })).toBeNull();
  });
});
