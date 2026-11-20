// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotArtifacts } from "./CopilotProductCards";
import { CopilotMarkdown } from "./CopilotMarkdown";
import { fetchCatalogProduct } from "@/services/api-bridge";

vi.mock("@/services/api-bridge", async importOriginal => ({
  ...await importOriginal<typeof import("@/services/api-bridge")>(),
  fetchCatalogProduct: vi.fn(),
}));

vi.mock("@/lib/workspaceSlug", () => ({
  tenantPath: (path: string) => `/acme${path}`,
}));

vi.mock("@/lib/mediaUrl", () => ({
  resolveMediaUrl: (url: string) => url || "",
}));

afterEach(() => {
  cleanup();
  vi.mocked(fetchCatalogProduct).mockReset();
});

const catalogHit = { kind: "product" as const, product: { id: "507f1f77bcf86cd799439011", name: "Navy Tee", sellingPriceInr: 499 } };

function CopilotLocation() {
  return <span data-testid="copilot-location">{useLocation().pathname}</span>;
}

function renderCatalogHit() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/acme/copilot"]}>
    <CopilotLocation />
    <CopilotArtifacts artifacts={[catalogHit]} />
  </MemoryRouter></QueryClientProvider>);
}

describe("Copilot product/kit cards", () => {
  it("opens verified details in chat and restores focus to the same product card", async () => {
    vi.mocked(fetchCatalogProduct).mockResolvedValue({
      id: catalogHit.product.id, nm: "Navy Tee", g: "tee", brand: "Catalog Brand", price: "", sw: 1,
      category: "Apparel", basePriceInr: 529, description: "Catalog-supplied cotton tee.",
      colors: ["Navy"], variants: [{ size: "M", stock: 3 } as { size: string; stock: number }],
    });
    renderCatalogHit();
    const trigger = screen.getByRole("link", { name: "View Navy Tee" });
    expect(fetchCatalogProduct).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Navy Tee" });
    expect(await within(dialog).findByText("₹529")).toBeInTheDocument();
    expect(within(dialog).getByText("Catalog-supplied cotton tee.")).toBeInTheDocument();
    expect(within(dialog).getByText("In stock")).toBeInTheDocument();
    expect(within(dialog).getByText("Navy")).toBeInTheDocument();
    expect(within(dialog).getByText("M")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open full catalog page" })).toHaveAttribute("href", trigger.getAttribute("href"));
    expect(fetchCatalogProduct).toHaveBeenCalledExactlyOnceWith(catalogHit.product.id);
    expect(screen.getByTestId("copilot-location")).toHaveTextContent("/acme/copilot");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trigger).toHaveFocus();
    });
    expect(screen.getByRole("link", { name: "View Navy Tee" })).toBe(trigger);
  });

  it("shows a failed lookup and retries without filling in missing catalog details", async () => {
    vi.mocked(fetchCatalogProduct).mockRejectedValueOnce(new Error("Catalog unavailable")).mockResolvedValueOnce({
      id: catalogHit.product.id, nm: "Navy Tee", g: "tee", brand: "", price: "", sw: 0,
    });
    renderCatalogHit();
    fireEvent.click(screen.getByRole("link", { name: "View Navy Tee" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Could not load catalog details.");
    expect(within(dialog).queryByText("₹499")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByText("Price on request")).toBeInTheDocument();
    expect(within(dialog).getByText("Availability unknown")).toBeInTheDocument();
  });

  it("renders product cards with View details navigation and no raw table", () => {
    const artifacts = [
      {
        kind: "product" as const,
        product: {
          id: "507f1f77bcf86cd799439011",
          name: "Navy Tee",
          brand: "Shelf Merch",
          sellingPriceInr: 499,
          primaryImageUrl: "https://cdn.example.com/navy.png",
          variants: [{ stock: 12 }],
        },
      },
    ];
    const dump = `| Name | Image |\n| --- | --- |\n| Navy Tee | https://cdn.example.com/navy.png |`;
    render(
      <MemoryRouter>
        <CopilotMarkdown content={dump} artifacts={artifacts} />
        <CopilotArtifacts artifacts={artifacts} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/cdn\.example\.com/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    const link = screen.getByRole("link", { name: /View Navy Tee/i });
    expect(link).toHaveAttribute("href", "/acme/catalog/507f1f77bcf86cd799439011");
    expect(link).toHaveClass("sm-copilot-product--catalog", "catalog-product-card");
    expect(within(link).getByText("Shelf Merch")).toBeInTheDocument();
    expect(within(link).getByText("AS LOW AS")).toBeInTheDocument();
    expect(within(link).getByText("View details")).toBeInTheDocument();
    expect(screen.getByText("Navy Tee")).toBeInTheDocument();
    expect(link).toHaveTextContent(/₹\s*499/);
  });

  it("shows catalog swatches and minimum quantities on both discovery and Swag cards", () => {
    const product = { ...catalogHit.product, moq: 3, images: ["https://official.test/tee.png"], variants: [
      { color: "Navy", stock: 2 }, { color: "Navy", stock: 1 }, { color: "White", stock: 6 },
    ] };
    const artifacts = [{ ...catalogHit, product }];
    const view = render(<MemoryRouter><CopilotArtifacts artifacts={artifacts} /></MemoryRouter>);
    const card = screen.getByRole("link", { name: "View Navy Tee" });
    expect(within(card).getByRole("img", { name: "Colors: Navy, White" })).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "Navy Tee" })).toHaveAttribute("src", product.images[0]);
    expect(within(card).getByText("Min 3")).toBeInTheDocument();
    expect(card).toHaveTextContent(/₹\s*499/);
    view.rerender(<MemoryRouter><CopilotArtifacts artifacts={artifacts} swag={{ selectedIds: [], busy: false, onToggle: vi.fn() }} /></MemoryRouter>);
    expect(screen.getByRole("img", { name: "Colors: Navy, White" })).toBeInTheDocument();
    expect(screen.getByText("Min 3")).toBeInTheDocument();
    expect(screen.getByText("₹499 incl. GST")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Navy Tee" })).toBeInTheDocument();
  });

  it("omits the color pill and minimum when catalog data is missing", () => {
    render(<MemoryRouter><CopilotArtifacts artifacts={[{ ...catalogHit, product: { ...catalogHit.product, sellingPriceInr: null, variants: [] } }]} /></MemoryRouter>);
    expect(screen.getByText("Price on request")).toBeInTheDocument();
    expect(screen.queryByText(/Min \d/)).toBeNull();
    expect(screen.queryByRole("img", { name: /Colors:/ })).toBeNull();
  });

  it("renders kit cards using imageUrl from MCP kit summaries", () => {
    const artifacts = [
      {
        kind: "kit" as const,
        kit: {
          id: "507f1f77bcf86cd799439033",
          name: "Colorful Diwali Celebration Kit",
          type: "curated",
          curated: true,
          priceInr: 1549,
          imageUrl: "https://cdn.example.com/diwali.png",
        },
      },
    ];
    render(
      <MemoryRouter>
        <CopilotArtifacts artifacts={artifacts} />
      </MemoryRouter>,
    );
    const img = document.querySelector(".sm-copilot-product__img img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("cdn.example.com/diwali.png");
    expect(screen.queryByLabelText(/No kit image available/i)).toBeNull();
  });

  it("renders kit cards with details navigation", () => {
    const artifacts = [
      {
        kind: "kit" as const,
        kit: {
          id: "507f1f77bcf86cd799439022",
          name: "Onboarding Kit",
          status: "live",
          type: "customized",
          priceInr: 1500,
          heroImage: "https://cdn.example.com/kit.png",
        },
      },
    ];
    render(
      <MemoryRouter>
        <CopilotMarkdown
          content={"Kits:\n| Name | Image |\n| --- | --- |\n| Onboarding Kit | https://cdn.example.com/kit.png |"}
          artifacts={artifacts}
        />
        <CopilotArtifacts artifacts={artifacts} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/cdn\.example\.com/)).toBeNull();
    const link = screen.getByRole("link", { name: /View Onboarding Kit/i });
    expect(link).toHaveAttribute("href", "/acme/kits/507f1f77bcf86cd799439022");
    expect(link).not.toHaveClass("sm-copilot-product--catalog");
  });

  it("renders safe markdown for normal assistant replies", () => {
    render(
      <MemoryRouter>
        <CopilotMarkdown content={"Allocate **budget** to Marketing.\n\n- Step one\n- Step two"} />
      </MemoryRouter>,
    );
    expect(screen.getByText("budget").tagName).toBe("STRONG");
    expect(screen.getByText("Step one")).toBeInTheDocument();
  });
  it("renders GitHub-flavored markdown tables safely", () => {
    render(
      <MemoryRouter>
        <CopilotMarkdown
          content={[
            "Department allocation:",
            "",
            "| Department | Allocated | Remaining |",
            "| --- | --- | --- |",
            "| Marketing | ₹5,000 | ₹4,500 |",
          ].join("\n")}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
    expect(screen.queryByText(/\| Department \|/)).toBeNull();
  });

  it("renders wallet balance card from backend figures", () => {
    render(
      <MemoryRouter>
        <CopilotMarkdown content={"Your available balance is ₹13,000."} artifacts={[{
          kind: "wallet_balance",
          wallet: {
            id: "w1",
            name: "Primary wallet",
            balance: 20000,
            allocatedAmount: 7000,
            unallocatedAmount: 13000,
          },
          reconciliation: {
            ok: false,
            warning: "Wallet allocated total does not match the sum of department remaining budgets by ₹1,000. Showing backend figures without adjustment.",
          },
        }]} />
        <CopilotArtifacts artifacts={[{
          kind: "wallet_balance",
          wallet: {
            id: "w1",
            name: "Primary wallet",
            balance: 20000,
            allocatedAmount: 7000,
            unallocatedAmount: 13000,
          },
          reconciliation: {
            ok: false,
            warning: "Wallet allocated total does not match the sum of department remaining budgets by ₹1,000. Showing backend figures without adjustment.",
          },
        }]} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Wallet balance")).toBeInTheDocument();
    expect(screen.getByText("Available ₹13,000")).toBeInTheDocument();
    expect(screen.getByText("Balance at the time of this reply.")).toBeInTheDocument();
    expect(screen.queryByText(/No balance snapshot/)).not.toBeInTheDocument();
    expect(screen.getByText(/₹1,000/)).toBeInTheDocument();
  });

  it("does not turn missing saved department budget data into an available zero balance", () => {
    render(<MemoryRouter><CopilotArtifacts artifacts={[{ kind: "department_budgets", departments: [] }]} /></MemoryRouter>);
    expect(screen.getByText(/Department budget data is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("Available ₹0")).toBeNull();
  });

  it("renders department budgets for entity managers without org wallet cash", () => {
    render(
      <MemoryRouter>
        <CopilotArtifacts
          artifacts={[
            {
              kind: "department_budgets",
              departments: [
                { name: "Marketing", allocatedAmount: 5000, remainingAmount: 4500 },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Department budgets")).toBeInTheDocument();
    expect(screen.getByText("Available ₹4,500")).toBeInTheDocument();
    expect(screen.queryByText("Total balance")).toBeNull();
  });
});
