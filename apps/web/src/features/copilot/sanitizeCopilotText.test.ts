import { describe, expect, it } from "vitest";
import {
  containsRawImageUrl,
  looksLikeRawProductTable,
  sanitizeCopilotAssistantText,
} from "./sanitizeCopilotText";

const productArtifacts = [
  {
    kind: "product" as const,
    product: {
      id: "p1",
      name: "Navy Tee",
      sellingPriceInr: 499,
      primaryImageUrl: "https://cdn.example.com/navy.png",
    },
  },
];

const kitArtifacts = [
  {
    kind: "kit" as const,
    kit: { id: "k1", name: "Welcome Kit", curated: true, approxValueInr: 1200 },
  },
];

describe("sanitizeCopilotAssistantText", () => {
  it("defers a prepared department summary to its card and leaves validation and other workflows visible", () => {
    const artifact = { kind: "confirmation" as const, operation: "entities.setup", confirmationId: "fixture", status: "pending" as const };
    const summary = "Marketing will receive ₹30,000. Sales will receive ₹20,000. Invitation emails will be sent.";
    expect(sanitizeCopilotAssistantText(summary, [artifact])).toBe("Review the department setup below before confirming.");
    const validation = "This allocation exceeds the unallocated wallet balance.";
    expect(sanitizeCopilotAssistantText(validation, [])).toBe(validation);
    expect(sanitizeCopilotAssistantText(summary, [{ ...artifact, operation: "budget.allocate" }])).toBe(summary);
  });

  it("strips markdown product tables and image URLs when product cards exist", () => {
    const raw = [
      "Here are some options:",
      "",
      "| Name | SKU | Price | Image |",
      "| --- | --- | --- | --- |",
      "| Navy Tee | SKU-1 | ₹499 | https://cdn.example.com/navy.png |",
      "| Grey Hoodie | SKU-2 | ₹999 | https://cdn.example.com/grey.jpg |",
      "",
      "Tell me if you want details on any of these.",
    ].join("\n");

    const cleaned = sanitizeCopilotAssistantText(raw, productArtifacts);
    expect(cleaned).toContain("Here are some options");
    expect(cleaned).toContain("Tell me if you want details");
    expect(looksLikeRawProductTable(cleaned)).toBe(false);
    expect(cleaned).not.toMatch(/https?:\/\//);
    expect(cleaned).not.toContain("SKU-1");
  });

  it("strips kit dump tables when kit cards exist", () => {
    const raw = [
      "Curated kits:",
      "| Kit | Value | Image |",
      "| --- | --- | --- |",
      "| Welcome Kit | ₹1200 | https://cdn.example.com/kit.png |",
    ].join("\n");
    const cleaned = sanitizeCopilotAssistantText(raw, kitArtifacts);
    expect(cleaned).toContain("Curated kits");
    expect(cleaned).not.toContain("https://cdn.example.com/kit.png");
    expect(looksLikeRawProductTable(cleaned)).toBe(false);
  });

  it("keeps normal markdown prose when no card artifacts", () => {
    const raw = "You can allocate **budget** to Marketing.\n\n1. Open Budgets\n2. Choose the department";
    const cleaned = sanitizeCopilotAssistantText(raw, []);
    expect(cleaned).toContain("**budget**");
    expect(cleaned).toContain("Open Budgets");
  });

  it("detects raw image URLs for regression guards", () => {
    expect(containsRawImageUrl("see https://cdn.example.com/x.png")).toBe(true);
    expect(containsRawImageUrl("no urls here")).toBe(false);
  });
  it("keeps financial markdown tables when no product/kit artifacts", () => {
    const raw = [
      "Here is the department allocation:",
      "",
      "| Department | Allocated | Remaining |",
      "| --- | --- | --- |",
      "| Marketing | ₹5,000 | ₹4,500 |",
      "| Sales | ₹3,000 | ₹2,500 |",
    ].join("\n");
    const cleaned = sanitizeCopilotAssistantText(raw, [
      {
        kind: "wallet_balance",
        wallet: {
          balance: 20000,
          allocatedAmount: 7000,
          unallocatedAmount: 13000,
        },
      },
    ]);
    expect(cleaned).toContain("| Department | Allocated | Remaining |");
    expect(looksLikeRawProductTable(cleaned)).toBe(true);
  });

  it("removes duplicated sourced-listing markdown when external product artifacts exist", () => {
    const raw = [
      "Here are a few kitchen options worth a closer look.",
      "",
      "I verified 3 of 5 requested listings in India. Current stock and delivery still need confirmation.",
      "",
      "**Sourced recommendations in India**",
      "",
      "1. **Smart Kitchen Scale** — Useful for meal-prep kits Listed unit price: ₹1,299. [Source 1](https://example.com/scale).",
      "2. **Milk Frother** — Pairs with coffee kits Unit price unknown. [Source 2](https://example.com/frother).",
      "",
      "**Unverified ideas to source**",
      "",
      "1. **Notebook Sleeve** — Easy for visitors to carry",
      "",
      "Ask a supplier for a per-item quote before ordering.",
    ].join("\n");
    const cleaned = sanitizeCopilotAssistantText(raw, [
      {
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
        },
      },
      {
        kind: "external_product",
        product: {
          verification: "verified_listing",
          name: "Milk Frother",
          productUrl: "https://example.com/frother",
          sourceUrl: "https://example.com/frother",
          sourceTitle: "Milk Frother",
          merchantHostname: "example.com",
          availability: "unknown",
          retrievedAt: "2026-11-23T10:00:00.000Z",
        },
      },
    ]);
    expect(cleaned).toContain("Here are a few kitchen options worth a closer look.");
    expect(cleaned).toContain("Unverified ideas to source");
    expect(cleaned).toContain("Notebook Sleeve");
    expect(cleaned).toContain("Ask a supplier for a per-item quote before ordering.");
    expect(cleaned).not.toContain("Sourced recommendations");
    expect(cleaned).not.toContain("I verified 3 of 5");
    expect(cleaned).not.toContain("Smart Kitchen Scale");
    expect(cleaned).not.toContain("Milk Frother");
    expect(cleaned).not.toContain("Listed unit price");
  });
});
