// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotArtifacts } from "./CopilotProductCards";
import { CopilotMarkdown } from "./CopilotMarkdown";
import type { CopilotWalletBalanceArtifact } from "./api";
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
const walletSnapshot: CopilotWalletBalanceArtifact = {
  kind: "wallet_balance",
  wallet: { id: "w1", name: "Primary wallet", balance: 20000, allocatedAmount: 7000, unallocatedAmount: 13000 },
};
const walletSummary = "Total balance: ₹20,000; allocated: ₹7,000; unallocated: ₹13,000.";

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
      category: "Apparel", basePriceInr: 529,
      description: "Catalog-supplied cotton tee.\\\nDesigned for everyday wear.",
      keyFeatures: "• Recycled cotton\n- Structured fit. Customizable branding.",
      colors: ["Navy"], variants: [{ size: "M", stock: 3 } as { size: string; stock: number }],
    });
    renderCatalogHit();
    const trigger = screen.getByRole("link", { name: "View Navy Tee" });
    expect(fetchCatalogProduct).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Navy Tee" });
    expect(await within(dialog).findByText("₹529")).toBeInTheDocument();
    expect(within(dialog).getByText("Catalog-supplied cotton tee.")).toBeInTheDocument();
    expect(within(dialog).getByText("Designed for everyday wear.")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Key features" })).toBeVisible();
    expect(within(dialog).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Recycled cotton", "Structured fit.", "Customizable branding.",
    ]);
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

  it("appends complete catalog batches without replacing existing cards", () => {
    const products = Array.from({ length: 117 }, (_, index) => ({
      kind: "product" as const,
      product: { id: `product-${index}`, name: `Catalog product ${index + 1}`, sellingPriceInr: 499,
        primaryImageUrl: "/official.png", inStock: index !== 0, variants: [{ color: "Black" }] },
    }));
    const renderBatch = (size: number) => <MemoryRouter>
      <CopilotArtifacts conversationId="catalog-search" artifacts={products.slice(0, size)} />
    </MemoryRouter>;
    const { rerender } = render(renderBatch(25));
    const first = screen.getByRole("link", { name: "View Catalog product 1" });
    expect(within(first).getByRole("img", { name: "Catalog product 1" })).toHaveAttribute("loading", "lazy");
    expect(within(first).getByText("₹499 incl. GST")).toBeVisible();
    expect(within(first).getByText("Out of stock")).toBeVisible();
    rerender(renderBatch(117));
    expect(screen.getAllByRole("link", { name: /View Catalog product/ })).toHaveLength(117);
    expect(screen.getByRole("link", { name: "View Catalog product 1" })).toBe(first);
    expect(screen.queryByRole("button", { name: /explore more|load more|next page/i })).not.toBeInTheDocument();
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
    const img = screen.getByRole("img", { name: "Colorful Diwali Celebration Kit" });
    expect(img).toHaveAttribute("src", "https://cdn.example.com/diwali.png");
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
    expect(link).toHaveClass("catalog-product-card");
    expect(within(link).getByText("Customized kit")).toBeInTheDocument();
    expect(within(link).getByText("Est.")).toBeInTheDocument();
    expect(within(link).getByText("View details")).toBeInTheDocument();
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

  it("renders backend wallet figures and warnings as inline reply content", () => {
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
    const result = screen.getByRole("region", { name: "Wallet balance" });
    expect(result).toHaveTextContent("Balance at the time of this reply.");
    expect(within(result).getByText("Available: ₹13,000")).toBeInTheDocument();
    expect(screen.queryByLabelText("Results")).not.toBeInTheDocument();
    expect(screen.queryByText(/No balance snapshot/)).not.toBeInTheDocument();
    expect(screen.getByText(/₹1,000/)).toBeInTheDocument();
  });

  it.each([
    walletSummary,
    "Your wallet has ₹20,000 in total, with ₹7,000 allocated and ₹13,000 remaining.",
    "Total balance: INR 20,000.00; allocated amount: Rs. 7,000; available balance: ₹13000.",
  ])("omits the inline wallet summary when the reply repeats each figure: %s", (text) => {
    render(<MemoryRouter><CopilotArtifacts artifacts={[walletSnapshot]} assistantReply={{ text }} /></MemoryRouter>);
    expect(screen.queryByLabelText("Wallet balance")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Results")).not.toBeInTheDocument();
  });

  it.each([
    ["one amount is missing", "Total balance: ₹20,000; available: ₹13,000."],
    ["amounts are swapped", "Total balance: ₹20,000; allocated: ₹13,000; available: ₹7,000."],
    ["an amount conflicts", `${walletSummary} Available: ₹12,000.`],
    ["the amounts are unlabelled", "₹20,000, ₹7,000 and ₹13,000."],
    ["the amounts are in example code", `\`\`\`text\n${walletSummary}\n\`\`\``],
  ])("shows the authoritative figures inline when %s", (_label, text) => {
    render(<MemoryRouter><CopilotArtifacts artifacts={[walletSnapshot]} assistantReply={{ text }} /></MemoryRouter>);
    expect(screen.getByLabelText("Wallet balance")).toBeInTheDocument();
  });

  it.each<Partial<CopilotWalletBalanceArtifact>>([
    { wallet: { ...walletSnapshot.wallet, fundingPending: true } },
    { departments: [{ name: "Marketing", allocatedAmount: 7000, remainingAmount: 7000 }] },
    { reconciliation: { ok: false, warning: "Review the wallet allocation discrepancy." } },
    { reconciliation: { ok: true, note: "Allocated reflects outstanding amounts." } },
  ])("shows additional snapshot details without repeating the balances: %j", (details) => {
    render(<MemoryRouter><CopilotArtifacts artifacts={[{ ...walletSnapshot, ...details }]} assistantReply={{ text: walletSummary }} /></MemoryRouter>);
    const reply = screen.getByRole("region", { name: "Wallet balance" });
    expect(reply).not.toHaveTextContent(/Total balance|Available:/);
    expect(reply).toHaveTextContent(details.wallet ? "Funding request pending approval."
      : details.departments ? "Marketing" : details.reconciliation?.warning || details.reconciliation?.note || "");
  });

  it("shows separate inline snapshots for multiple wallets after the reply finishes streaming", () => {
    const artifacts = [walletSnapshot, { ...walletSnapshot, wallet: { ...walletSnapshot.wallet, id: "w2", name: "Second wallet" } }];
    const { rerender } = render(<MemoryRouter><CopilotArtifacts artifacts={artifacts} assistantReply={{ text: "", streaming: true }} /></MemoryRouter>);
    expect(screen.queryByLabelText("Wallet balance")).not.toBeInTheDocument();
    rerender(<MemoryRouter><CopilotArtifacts artifacts={artifacts} assistantReply={{ text: walletSummary }} /></MemoryRouter>);
    expect(screen.getAllByLabelText("Wallet balance")).toHaveLength(2);
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
                { name: "Marketing", allocatedAmount: 5000, spentAmount: 500, remainingAmount: 4500 },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );
    const result = screen.getByRole("region", { name: "Department budgets" });
    expect(result).toHaveTextContent("Available ₹4,500");
    expect(within(result).getByRole("listitem")).toHaveTextContent("Marketing · Allocated ₹5,000 · Spent ₹500 · Remaining ₹4,500");
    expect(screen.queryByLabelText("Results")).not.toBeInTheDocument();
    expect(screen.queryByText("Total balance")).toBeNull();
  });

  it("shows departments not already present in the wallet snapshot", () => {
    const marketing = { entityId: "m1", name: "Marketing", allocatedAmount: 1000, remainingAmount: 500 };
    const sales = { entityId: "s1", name: "Sales", allocatedAmount: 800, remainingAmount: 600 };
    render(<MemoryRouter><CopilotArtifacts artifacts={[
      { ...walletSnapshot, departments: [marketing] },
      { kind: "department_budgets", departments: [marketing, sales] },
    ]} /></MemoryRouter>);
    expect(screen.getAllByText("Marketing")).toHaveLength(1);
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("renders verified external products as borderless editorial rows with price fallback", () => {
    const { container } = render(<MemoryRouter><CopilotArtifacts artifacts={[{
      kind: "external_product",
      product: {
        verification: "verified_listing",
        name: "Smart Kitchen Scale",
        productUrl: "https://example.com/scale",
        sourceUrl: "https://example.com/scale",
        sourceTitle: "Smart Kitchen Scale",
        merchantHostname: "example.com",
        availability: "unknown",
        retrievedAt: "2026-11-23T10:00:00.000Z",
        reason: "Useful for meal-prep kits",
      },
    }]} /></MemoryRouter>);
    const list = screen.getByRole("region", { name: "Verified external products" });
    expect(list).toHaveClass("sm-copilot-external-list");
    expect(list.querySelector(".catalog-product-card")).toBeNull();
    expect(screen.queryByText("Verified external listings")).not.toBeInTheDocument();
    expect(screen.queryByText("Verified external listing")).not.toBeInTheDocument();
    expect(screen.getByText("Price unavailable")).toBeInTheDocument();
    expect(screen.getByText("Useful for meal-prep kits")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("No merchant image available")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Smart Kitchen Scale" })).toHaveAttribute("href", "https://example.com/scale");
    expect(screen.getByRole("link", { name: /View product/i })).toHaveAttribute("href", "https://example.com/scale");
    expect(container.querySelector(".sm-copilot-external-row")).toBeTruthy();
  });

  it("renders five external products as separated rows with merchant images and structured features when provided", () => {
    const products = [
      ["Scale One", "₹499", "https://cdn.shop.example.com/1.jpg"],
      ["Scale Two", "₹599", "https://cdn.shop.example.com/2.jpg"],
      ["Scale Three", undefined, "https://cdn.shop.example.com/3.jpg"],
      ["Scale Four", "₹799", ""],
      ["Scale Five With A Very Long Product Name For Alignment", "₹899", "https://cdn.shop.example.com/5.jpg"],
    ] as const;
    const { container } = render(<MemoryRouter><CopilotArtifacts artifacts={products.map(([name, price, image], index) => ({
      kind: "external_product" as const,
      product: {
        verification: "verified_listing" as const,
        name,
        productUrl: `https://shop.example.com/p/${index + 1}`,
        sourceUrl: `https://shop.example.com/p/${index + 1}`,
        sourceTitle: name,
        merchantHostname: "shop.example.com",
        availability: "unknown" as const,
        retrievedAt: "2026-11-23T10:00:00.000Z",
        ...(price ? { priceText: price, priceNumeric: Number(price.replace(/[^\d]/g, "")), currency: "INR" } : {}),
        ...(image ? { imageUrl: image, imageProvenance: "merchant_og" as const } : {}),
        ...(index === 0 ? { features: ["Evidence feature A", "Evidence feature B"] } : {}),
        reason: index === 1 ? "Compact secondary description" : undefined,
      },
    }))} /></MemoryRouter>);
    const rows = container.querySelectorAll(".sm-copilot-external-row");
    expect(rows).toHaveLength(5);
    expect(screen.getByText("₹499")).toBeInTheDocument();
    expect(screen.getByText("Price unavailable")).toBeInTheDocument();
    expect(screen.getByText("Compact secondary description")).toBeInTheDocument();
    expect(screen.getByText("Evidence feature A")).toBeInTheDocument();
    expect(container.querySelectorAll(".sm-copilot-external-row__features li")).toHaveLength(2);
    expect(container.querySelector(".catalog-product-card")).toBeNull();
    expect(container.querySelector('img[src="https://cdn.shop.example.com/1.jpg"]')).toBeTruthy();
    expect(screen.getAllByText("shop.example.com")).toHaveLength(5);
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("5.")).toBeInTheDocument();
  });

  it("renders a merchant imageUrl on external product rows and falls back when the image errors", () => {
    const { container } = render(<MemoryRouter><CopilotArtifacts artifacts={[{
      kind: "external_product",
      product: {
        verification: "verified_listing",
        name: "Milk Frother",
        productUrl: "https://shop.example.com/frother",
        sourceUrl: "https://shop.example.com/frother",
        sourceTitle: "Milk Frother",
        merchantHostname: "shop.example.com",
        availability: "unknown",
        retrievedAt: "2026-11-23T10:00:00.000Z",
        imageUrl: "https://cdn.shop.example.com/products/frother.jpg",
        imageProvenance: "merchant_og",
      },
    }]} /></MemoryRouter>);
    const img = container.querySelector('img[src="https://cdn.shop.example.com/products/frother.jpg"]');
    expect(img).toBeTruthy();
    expect(img).toHaveAttribute("alt", "Milk Frother");
    fireEvent.error(img!);
    expect(screen.getByLabelText("No merchant image available")).toBeInTheDocument();
  });

  it("renders gift kit ideas with verified and concept components and incomplete budget", () => {
    render(<MemoryRouter><CopilotArtifacts artifacts={[{
      kind: "gift_kit_idea",
      kit: {
        name: "Coffee lab kit",
        rationale: "A practical welcome kit for kitchen-tech fans.",
        packagingSuggestion: "Branded sleeve with a welcome note.",
        recipientFit: "Practical corporate gifting fit for Toast employees.",
        components: [
          {
            role: "verified_listing",
            name: "Milk Frother",
            externalProductIndex: 0,
            productUrl: "https://example.com/frother",
            priceText: "₹899",
            priceNumeric: 899,
            currency: "INR",
          },
          { role: "concept", name: "Recipe card set", reason: "A complementary concept to source from a printer." },
        ],
        budget: {
          status: "partial",
          currency: "INR",
          knownSubtotal: 899,
          missingPriceCount: 1,
          note: "Item prices only when source-verified. Packaging, branding, GST and shipping are not included.",
        },
        imagePolicy: "none",
      },
    }]} /></MemoryRouter>);
    expect(screen.getByText("Gifting kit ideas")).toBeInTheDocument();
    expect(screen.getByText("Concept")).toBeInTheDocument();
    expect(screen.getByText(/Recipe card set/)).toBeInTheDocument();
    expect(screen.getByText(/1 price needs confirmation/i)).toBeInTheDocument();
    expect(screen.getByText(/No complete kit photograph/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Milk Frother" })).toHaveAttribute("href", "https://example.com/frother");
  });
});
