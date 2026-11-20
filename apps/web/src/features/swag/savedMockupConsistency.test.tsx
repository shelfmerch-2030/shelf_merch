// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mapCatalogProduct, mapCollection } from "@/services/mappers";
import { CollectionInlineCard } from "./CollectionInlineCard";
import { DesignedProductThumb } from "./DesignedProductThumb";
import { savedDesignPreview, bakeTintedMockupLayers } from "./mockup-bake";
import { CollectionViewDialog } from "@/features/shops/CollectionViewDialog";
import { ProductThumb } from "@/features/shops/ProductThumb";
import { toFeaturedPreviewProduct } from "@/features/shops/ShopHomePreview";
import { SwagSavedPreviews } from "@/features/copilot/SwagSavedPreviews";

vi.mock("./mockup-bake", async original => ({ ...await original<typeof import("./mockup-bake")>(),
  bakeTintedMockupLayers: vi.fn().mockResolvedValue("data:image/png;base64,dGludA=="),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const placement = { xPct: 50, yPct: 50, wPct: 20, rot: 0, printCxPct: 50, printCyPct: 50, printWPct: 70 };
const products = ["Bliss Mug", "Corporate Polo", "Cozy Mug", "Plain Product"].map((name, index) => mapCatalogProduct({
  _id: `product-${index}`, name, category: "Apparel", group: "polo", basePriceInr: 500,
  primaryImageUrl: `/catalog-${index}.png`, maskImageUrl: `/mask-${index}.png`, maskBackImageUrl: `/back-${index}.png`,
  physicalDimensions: { width: 20, height: 24 },
  printAreas: index < 3 ? [{ key: "front", widthIn: 2, heightIn: 2 }, { key: "back", widthIn: 3, heightIn: 3 }] : [],
}));
function collection(id = "collection-a", version = "v1") {
  return mapCollection({ _id: id, name: "Saved collection", artworkUrl: "/shared-logo.png", productRefs: products.map((product, index) => ({
    catalogProductId: product.id, name: product.nm,
    ...(index < 3 ? { mockupUrl: `/${id}/${product.id}/${version}.png`, mockupBackUrl: `/${id}/${product.id}/back-${version}.png`,
      placements: [{ key: "front", ...placement, artworkUrl: `/area-${index}.png` }] } : {}),
  })) }, "", new Map(products.map(product => [product.id!, product])));
}
it("collection listing uses all three saved product mockups with per-area artwork and leaves the plain product unbranded", () => {
  const value = collection(); render(<CollectionInlineCard collection={value} />);
  for (const product of value.products.slice(0, 3)) expect(screen.getByRole("img", { name: product.nm })).toHaveAttribute("src", product.mockupUrl);
  expect(screen.getByRole("img", { name: "Plain Product" })).not.toHaveAttribute("src", value.products[0].mockupUrl);
  expect(bakeTintedMockupLayers).not.toHaveBeenCalled();
});
it("shop management dialog and branded thumbnails prefer exactly the same saved references", () => {
  const value = collection(); const view = render(<CollectionViewDialog collection={value} open onOpenChange={vi.fn()} />);
  for (const product of value.products.slice(0, 3)) expect(screen.getByRole("img", { name: product.nm })).toHaveAttribute("src", product.mockupUrl);
  view.unmount(); render(<ProductThumb product={value.products[0]} branded />);
  expect(screen.getByRole("img")).toHaveAttribute("src", value.products[0].mockupUrl);
});
it("Copilot and storefront home previews resolve the persisted collection-product mockup", () => {
  const value = collection(); render(<SwagSavedPreviews source={{ products: value.products.map(p => ({ id: p.id, name: p.nm })),
    designs: value.products.map(p => ({ productId: p.id, mockupUrl: p.mockupUrl })) }} />);
  for (const product of value.products.slice(0, 3)) {
    expect(screen.getByAltText(`Saved design for ${product.nm}`)).toHaveAttribute("src", product.mockupUrl);
    expect(toFeaturedPreviewProduct(product).imageUrl).toBe(product.mockupUrl);
  }
  expect(toFeaturedPreviewProduct(value.products[3]).imageUrl).toBe(products[3].photoUrl);
});
it("a saved mockup also wins for a multi-area legacy design without individual artwork URLs", () => {
  const product = { ...collection().products[0], areaPlacements: undefined };
  const preview = savedDesignPreview(product, "/shared-logo.png");
  expect(preview.preferBakedMockup).toBe(true);
  render(<DesignedProductThumb product={product} {...preview} />);
  expect(screen.getByRole("img")).toHaveAttribute("src", product.mockupUrl);
});
it("products without a saved bake retain legacy per-area compositing", () => {
  const product = { ...collection().products[0], mockupUrl: undefined, mockupBackUrl: undefined };
  expect(savedDesignPreview(product, "/shared-logo.png")).toEqual({ artworkUrl: undefined, preferBakedMockup: false });
});
it("regenerated immutable image URLs replace old URLs on rerender", () => {
  const view = render(<CollectionInlineCard collection={collection()} />);
  view.rerender(<CollectionInlineCard collection={collection("collection-a", "v2")} />);
  for (const image of screen.getAllByRole("img").slice(0, 3)) expect(image.getAttribute("src")).toContain("/v2.png");
});
it("the same catalog product in another collection cannot reuse the first collection's mockup", () => {
  const view = render(<CollectionInlineCard collection={collection()} />);
  view.rerender(<CollectionInlineCard collection={collection("collection-b")} />);
  expect(screen.getByRole("img", { name: "Bliss Mug" })).toHaveAttribute("src", "/collection-b/product-0/v1.png");
});
it("intentional back views use the saved back image", () => {
  const product = collection().products[0]; render(<DesignedProductThumb product={product} {...savedDesignPreview(product)} view="back" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", product.mockupBackUrl);
});
it("a front mockup is never substituted for a missing back mockup", () => {
  const product = { ...collection().products[0], mockupBackUrl: undefined };
  render(<DesignedProductThumb product={product} {...savedDesignPreview(product)} view="back" />);
  expect(screen.getByRole("img").getAttribute("src")).not.toBe(product.mockupUrl);
});
it("explicit variant tints keep using saved product-specific placements instead of the default mockup", async () => {
  const product = collection().products[0]; render(<DesignedProductThumb product={product} {...savedDesignPreview(product)} tintHex="#123456" />);
  await waitFor(() => expect(bakeTintedMockupLayers).toHaveBeenCalled());
  expect(vi.mocked(bakeTintedMockupLayers).mock.calls[0][1]).toEqual([expect.objectContaining({ artUrl: "/area-0.png", areaKey: "front", placement: expect.objectContaining(placement) })]);
  expect(screen.getByRole("img").getAttribute("src")).not.toBe(product.mockupUrl);
});

it("single-colour products keep their saved mockup even when a tint is requested", () => {
  const product = { ...collection().products[0], variants: [
    { color: "Black", size: "S" }, { color: "black ", size: "L" },
  ] };
  render(<DesignedProductThumb product={product} {...savedDesignPreview(product)} tintHex="#123456" />);
  expect(screen.getByRole("img")).toHaveAttribute("src", product.mockupUrl);
  expect(bakeTintedMockupLayers).not.toHaveBeenCalled();
});

it("single-colour products without a bake keep the original image and per-area artwork", () => {
  const product = { ...collection().products[0], mockupUrl: undefined, mockupBackUrl: undefined,
    variants: [{ color: "Black", size: "S" }, { color: "Black", size: "L" }],
  };
  const view = render(<DesignedProductThumb product={product} {...savedDesignPreview(product)} tintHex="#123456" />);
  expect(screen.getByRole("img", { name: product.nm })).toHaveAttribute("src", product.photoUrl);
  expect(screen.getByRole("img", { name: "Artwork" })).toHaveAttribute("src", "/area-0.png");
  expect(view.container.querySelector("canvas")).toBeNull();
  expect(bakeTintedMockupLayers).not.toHaveBeenCalled();
});

it("products with multiple catalog colours retain tinting", async () => {
  const product = { ...collection().products[0], variants: [{ color: "Black" }, { color: "Blue" }] };
  render(<DesignedProductThumb product={product} {...savedDesignPreview(product)} tintHex="#123456" />);
  await waitFor(() => expect(bakeTintedMockupLayers).toHaveBeenCalled());
  expect(screen.getByRole("img").getAttribute("src")).not.toBe(product.mockupUrl);
});
