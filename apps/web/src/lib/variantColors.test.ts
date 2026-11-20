import { describe, expect, it } from "vitest";
import { hasSingleCatalogColor } from "./variantColors";
import { getMockupTintHex } from "@/features/swag/colors";
import { storeProductAsUi } from "@/features/swag/DesignedProductThumb";

describe("single catalog colour previews", () => {
  it("counts sizes of the same colour once, including case and whitespace differences", () => {
    expect(hasSingleCatalogColor({ variants: [
      { color: "Black", size: "S" }, { color: " black ", size: "L" }, { size: "XL" },
    ] })).toBe(true);
    expect(hasSingleCatalogColor({ variants: [
      { colorHex: "#123456", size: "S" }, { colorHex: "#123456", size: "L" },
    ] })).toBe(true);
  });

  it("uses catalog variants even when displayed colours are curated down to one", () => {
    const product = { colors: ["Black"], variants: [{ color: "Black" }, { color: "Blue" }] };
    expect(hasSingleCatalogColor(product)).toBe(false);
    expect(getMockupTintHex("#123456", true, product)).toBe("#123456");
  });

  it("keeps products with missing colour data on the existing rendering path", () => {
    expect(hasSingleCatalogColor(undefined)).toBe(false);
    expect(hasSingleCatalogColor({ variants: [{ size: "S" }, { size: "L" }] })).toBe(false);
    expect(getMockupTintHex("#123456", true)).toBe("#123456");
  });

  it("suppresses live tinting for one mapped colour after an explicit swatch pick", () => {
    expect(hasSingleCatalogColor({ colors: [" Black ", "black"] })).toBe(true);
    expect(getMockupTintHex("#123456", true, { colors: ["Black"] })).toBeUndefined();
  });

  it("preserves single-colour catalog data through the storefront adapter", () => {
    const product = storeProductAsUi({ name: "Black shirt", variants: [
      { color: "Black", size: "S" }, { color: "Black", size: "L" },
    ] });
    expect(hasSingleCatalogColor(product)).toBe(true);
    expect(getMockupTintHex("#000000", true, product)).toBeUndefined();
  });
});
