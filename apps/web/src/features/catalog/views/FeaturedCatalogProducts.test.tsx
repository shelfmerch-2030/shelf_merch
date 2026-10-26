// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { UiProduct } from "../model";
import { FeaturedCatalogProducts, selectFeaturedProducts } from "./FeaturedCatalogProducts";

const makeProduct = (id: string, category: string): UiProduct => ({ id, nm: `Product ${id}`, category: category === "Apparel" ? "Apparel" : "Accessories", subcategory: category, photoUrl: `/products/${id}.png`, brand: "Shelf Merch", g: "", price: "₹410", basePriceInr: 410, sw: 0 });
const products = [makeProduct("tee", "Apparel"), makeProduct("tee2", "Apparel"), makeProduct("bottle", "Drinkware"), makeProduct("diary", "Stationery"), makeProduct("speaker", "Electronics & Gadgets"), makeProduct("bag", "Bags")];
afterEach(cleanup);

describe("featured catalog products", () => {
  it("features the requested vacuum and massager in the last two slots when available", () => {
    const vacuum = { ...makeProduct("6ac49be66f87655fa994cfb0", "Home Appliances"), nm: "2-in-1 Stick & Handy Vacuum Cleaner with Hepa Filter" };
    const massager = { ...makeProduct("6abb6a21d602f72fd2df9100", "Travel Accessories"), nm: "Neck & Shoulder Massager" };
    expect(selectFeaturedProducts([...products, vacuum, massager]).map((product) => product.id))
      .toEqual(["tee", "bottle", "diary", vacuum.id, massager.id]);
  });
  it("selects five distinct live products across categories instead of the first five from one category", () => {
    expect(selectFeaturedProducts(products).map((product) => product.id)).toEqual(["tee", "bottle", "diary", "speaker", "bag"]);
    expect(selectFeaturedProducts([products[0], products[0], products[1]]).map((product) => product.id)).toEqual(["tee", "tee2"]);
    expect(selectFeaturedProducts([{ ...products[0], id: undefined }])).toHaveLength(0);
  });
  it.each(["/app/catalog", "/apps/catalog"])("shows actual product details and working product/collection links under %s", (home) => {
    render(<MemoryRouter initialEntries={[home]}><Routes>
      <Route path={home} element={<FeaturedCatalogProducts products={products} />} />
      <Route path={`${home}/tee`} element={<h1>Selected product detail</h1>} />
    </Routes></MemoryRouter>);
    expect(screen.getAllByRole("img")).toHaveLength(5);
    expect(screen.getAllByText("SHELF MERCH", { exact: false })).toHaveLength(5);
    expect(screen.getAllByText("410")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Browse all products" }).getAttribute("href")).toBe(`${home}/category/all-products`);
    const productLink = screen.getByRole("link", { name: "View Product tee" });
    expect(productLink.getAttribute("href")).toBe(`${home}/tee`);
    fireEvent.click(productLink);
    expect(screen.getByRole("heading", { name: "Selected product detail" })).toBeTruthy();
  });
  it("handles loading and failure without displaying invented products", () => {
    const { rerender } = render(<MemoryRouter><FeaturedCatalogProducts products={[]} loading /></MemoryRouter>);
    expect(screen.getByLabelText("Loading catalog products")).toBeTruthy();
    rerender(<MemoryRouter><FeaturedCatalogProducts products={[]} error="Could not load products" /></MemoryRouter>);
    expect(screen.getByRole("alert").textContent).toBe("Could not load products");
    expect(screen.queryByRole("img")).toBeNull();
  });
});
