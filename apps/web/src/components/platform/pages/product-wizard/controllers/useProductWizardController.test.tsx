// @vitest-environment happy-dom
import { type ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { getPlatformProduct, type PlatformProduct } from "../model";
import { useProductWizardController } from "./useProductWizardController";

vi.mock("../model", async (original) => ({
  ...await original<typeof import("../model")>(),
  getPlatformProduct: vi.fn(),
  listCategories: vi.fn().mockResolvedValue([]),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const product: PlatformProduct = {
  _id: "shirt", name: "Shirt", sku: "shirt", category: "Apparel", status: "draft",
  sellingPriceInr: 500, costPriceInr: 300, imageUrls: [], printAreas: [],
  maskImageUrl: "/front.png", maskBackImageUrl: "/back.png",
  maskLeftImageUrl: "/left.png", maskRightImageUrl: "/right.png",
  variants: [{ color: "Black", size: "S" }, { color: "Black", size: "L" }],
};

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

it("keeps persisted PNG masks raw on every view for one colour with several sizes", async () => {
  vi.mocked(getPlatformProduct).mockResolvedValue(product);
  const { result } = renderHook(() => useProductWizardController("edit", "shirt"), { wrapper });
  await waitFor(() => expect(result.current.product?._id).toBe("shirt"));
  expect(result.current.activeMaskCanTint).toBe(false);
  expect(result.current.untintedMaskImageUrls).toEqual(["/front.png", "/back.png", "/left.png", "/right.png"]);
});

it("retains colour preview support for products with multiple catalog colours", async () => {
  vi.mocked(getPlatformProduct).mockResolvedValue({ ...product, variants: [
    ...product.variants, { color: "Blue", size: "S" },
  ] });
  const { result } = renderHook(() => useProductWizardController("edit", "shirt"), { wrapper });
  await waitFor(() => expect(result.current.product?._id).toBe("shirt"));
  expect(result.current.activeMaskCanTint).toBe(true);
  expect(result.current.untintedMaskImageUrls).toEqual([]);
});
