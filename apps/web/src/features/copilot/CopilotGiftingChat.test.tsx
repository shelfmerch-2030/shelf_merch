// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { CopilotArtifacts } from "./CopilotProductCards";
import type { CopilotArtifact } from "./api";
import type { Curation, ChatGiftGroup } from "./curatorTypes";
afterEach(cleanup);
const lamp = { kind: "product" as const, product: { id: "507f1f77bcf86cd799439011", name: "Desk lamp", sellingPriceInr: 1200, primaryImageUrl: "https://official.test/lamp.png", variants: [{ color: "Navy", stock: 100 }] } };
const notebook = { kind: "product" as const, product: { id: "507f1f77bcf86cd799439012", name: "Notebook", sellingPriceInr: 300, primaryImageUrl: "https://official.test/notes.png", variants: [{ stock: 50 }] } };
function renderGroups(groups: ChatGiftGroup[]) {
  const curation: Curation = { brief: { recipients: 50, budgetPerRecipient: 2000, currency: "INR" }, concepts: [], suggestions: [], externalResearchAvailable: false, imageGenerationAvailable: false, chat: { groups, requestedCount: 20, shownCount: 2, bounded: true } };
  return render(<MemoryRouter><CopilotArtifacts artifacts={[{ kind: "curation", curation }]} /></MemoryRouter>);
}
describe("gifting groups in existing chat product cards", () => {
  it("renders real images, GST prices, availability and deterministic combination totals inline", () => {
    renderGroups([{ name: "First-day focus", rationale: "Practical desk essentials.", kind: "combination", artifacts: [lamp, notebook], subtotal: 1500, total: 75000, completePrice: true, budgetDifference: 500 }]);
    const group = screen.getByRole("region", { name: "First-day focus" });
    expect(within(group).getByRole("img", { name: "Desk lamp" })).toHaveAttribute("src", "https://official.test/lamp.png");
    expect(within(group).getByText("₹1,200 incl. GST")).toBeInTheDocument();
    expect(group).toHaveTextContent("₹75,000.00 for 50 recipients");
    expect(group).toHaveTextContent("₹500.00 under budget");
    expect(screen.getAllByRole("link", { name: /View / })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Curate Gifts/ })).toBeNull();
    expect(document.querySelector(".sm-curator-layout")).toBeNull();
  });
  it("handles missing prices/images without displaying a fabricated complete total", () => {
    renderGroups([{ name: "Partial", rationale: "", kind: "combination", artifacts: [lamp, { kind: "product", product: { id: "unknown", name: "Unknown price gift", sellingPriceInr: null, primaryImageUrl: "" } }], subtotal: 1200, total: null, completePrice: false, missingPrices: 1 }]);
    expect(screen.getByText("Price on request")).toBeInTheDocument();
    expect(screen.getByLabelText("No product image available")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Partial" })).toHaveTextContent("Partial known item subtotal");
    expect(screen.queryByText(/for 50 recipients/)).toBeNull();
  });
  it("distinguishes existing kits and displays actual contents without inventing a kit detail route", () => {
    const kit: Extract<CopilotArtifact, { kind: "kit" }> = { kind: "kit", kit: { id: "platform-kit", name: "Diwali kit", curated: true, type: "curated", status: "active", recommendation: true, availability: "In stock", priceInr: 1500, imageUrl: "https://official.test/kit.png", products: [{ name: "Notebook", quantity: 2 }] } };
    renderGroups([{ name: "Actual Diwali kit", rationale: "", kind: "existing_kit", artifacts: [kit], subtotal: 1500, completePrice: true }]);
    expect(screen.getByText("Existing ShelfMerch kit")).toBeInTheDocument();
    expect(screen.getByText("Notebook × 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Diwali kit" }).getAttribute("href")).toMatch(/\/kits$/);
    expect(screen.getByRole("img", { name: "Diwali kit" })).toHaveAttribute("src", "https://official.test/kit.png");
  });
  it("renders individual alternatives without suggesting that all items must be bought together", () => {
    renderGroups([{ name: "Desk alternatives", rationale: "Choose one that fits.", kind: "products", artifacts: [lamp, notebook] }]);
    expect(screen.getByText("Individual catalog options")).toBeInTheDocument();
    expect(screen.queryByText(/Item subtotal/)).toBeNull();
  });
});
