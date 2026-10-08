import { describe, expect, it } from "vitest";
import { catalogProductMeta } from "../../../api/src/modules/seo/catalogProductDocument.js";

describe("catalog product head", () => {
  it("keeps public product metadata free of price and inventory", () => {
    const meta = catalogProductMeta(
      {
        id: "507f1f77bcf86cd799439011",
        name: "Summit Tee",
        description: "A public cotton tee",
        brand: "ShelfMerch",
        category: "Apparel",
        image: "/images/landing/hero.png",
      },
      "https://shelfmerch.io",
    );
    const encoded = JSON.stringify(meta);
    expect(meta.title).toBe("Summit Tee | ShelfMerch");
    expect(meta.canonical).toBe("https://shelfmerch.io/apps/catalog/507f1f77bcf86cd799439011");
    expect(meta.jsonLd["@type"]).toBe("Product");
    expect(encoded).not.toContain("offers");
    expect(encoded).not.toContain("987654");
  });
});
