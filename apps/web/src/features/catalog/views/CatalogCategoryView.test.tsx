// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { CatalogCategoryView } from "./CatalogCategoryView";
import { FALLBACK_CATALOG_NODES, resolveCatalogBrowseTarget } from "../types";
import type { CatalogVm } from "../controllers/useCatalogController";
import type { UiProduct } from "../model";

vi.mock("../controllers/useCatalogKitsController", () => ({
  useCatalogKitsController: () => ({ allKits: [], kits: [], isLoading: false }),
}));
vi.mock("./CatalogKitsGrid", () => ({ CatalogKitsGrid: () => null }));

const products: UiProduct[] = [
  { id: "tee1", g: "", brand: "Cotton Co", nm: "Classic Tee", category: "Apparel", subcategory: "Apparel", childCategory: "T-Shirts", price: "₹500", basePriceInr: 500, sw: 1, colors: ["Black"], variants: [{ size: "M", color: "Black", material: "Cotton" }] },
  { id: "tee2", g: "", brand: "Everyday", nm: "Premium Tee", category: "Apparel", subcategory: "Apparel", childCategory: "T-Shirts", price: "₹900", basePriceInr: 900, sw: 1, colors: ["Blue"], variants: [{ size: "L", color: "Blue", material: "Cotton" }] },
  { id: "polo", g: "", brand: "Cotton Co", nm: "Team Polo", category: "Apparel", subcategory: "Apparel", childCategory: "Polo Shirts", price: "₹700", sw: 0 },
  { id: "mug", g: "", brand: "", nm: "Ceramic Mug", category: "Accessories", subcategory: "Drinkware", childCategory: "Mugs", price: "₹300", sw: 0 },
];

function Page() {
  const { category } = useParams();
  const browse = resolveCatalogBrowseTarget(category);
  const vm: CatalogVm = {
    ...browse, isCategorySelected: true, categories: FALLBACK_CATALOG_NODES.map((node) => node.name),
    categoryNodes: FALLBACK_CATALOG_NODES,
    categoriesByParent: Object.fromEntries(FALLBACK_CATALOG_NODES.map((node) => [node.name, node.children])),
    subcategoriesByCategory: {}, items: products.filter((product) => product.category === browse.parent),
    stylePreviewProducts: [], count: products.length, isSkeleton: false, errorMessage: null, onCategory: vi.fn(),
  };
  return <CatalogCategoryView {...vm} />;
}

function open(path = "/apps/catalog/category/apparel") {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/apps/catalog/category/:category" element={<Page />} /></Routes></MemoryRouter>);
}
afterEach(cleanup);

describe("category shopping flow", () => {
  it("opens T-Shirts from the Apparel image card and shows only T-shirts", () => {
    open();
    fireEvent.click(screen.getByRole("link", { name: "T-Shirts category T-Shirts" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("T-Shirts");
    expect(screen.getByRole("status").textContent).toBe("2 products");
    expect(screen.queryByRole("link", { name: "View Team Polo" })).toBeNull();
    expect(screen.getByRole("link", { name: "View Classic Tee" }).getAttribute("href")).toBe("/apps/catalog/tee1");
    fireEvent.click(screen.getByRole("link", { name: "Polo Shirts" }));
    expect(screen.getByRole("link", { name: "View Team Polo" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Classic Tee" })).toBeNull();
  });

  it("supports search, price sorting, attribute filters and clearing", () => {
    open("/apps/catalog/category/t-shirts");
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), { target: { value: "price-desc" } });
    const results = screen.getByRole("region", { name: "T-Shirts products" });
    expect(within(results).getAllByRole("link")[0].textContent).toContain("Premium Tee");
    fireEvent.click(screen.getByRole("checkbox", { name: "Black" }));
    expect(screen.getByRole("status").textContent).toBe("1 product");
    expect(screen.queryByRole("link", { name: "View Premium Tee" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no such tee" } });
    expect(screen.getByRole("heading", { name: "No products found" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(screen.getByRole("status").textContent).toBe("2 products");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Max" }), { target: { value: "600" } });
    expect(screen.getByRole("status").textContent).toBe("1 product");
  });

  it("View all Apparel opens products rather than category cards", () => {
    open();
    fireEvent.click(screen.getByRole("link", { name: "View all Apparel" }));
    expect(screen.getByRole("status").textContent).toBe("3 products");
    expect(screen.getByRole("link", { name: "View Team Polo" })).toBeTruthy();
  });

  it("supports the same flow for Drinkware and Mugs", () => {
    open("/apps/catalog/category/drinkware");
    fireEvent.click(screen.getByRole("link", { name: "Mugs category Mugs" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mugs");
    expect(screen.getByRole("link", { name: "View Ceramic Mug" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Classic Tee" })).toBeNull();
  });
});
