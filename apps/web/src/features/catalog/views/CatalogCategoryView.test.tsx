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
  { id: "mug", createdAt: "2025-01-01T00:00:00Z", g: "", brand: "", nm: "Ceramic Mug", category: "Accessories", subcategory: "Drinkware", childCategory: "Mugs", price: "₹300", sw: 0 },
  { id: "bottle", createdAt: "2026-01-01T00:00:00Z", g: "", brand: "", nm: "Blue Bottle", category: "Accessories", subcategory: "Drinkware", childCategory: "Bottles", price: "₹500", sw: 0 },
  { id: "diary", g: "", brand: "", nm: "Linen Diary", category: "Accessories", subcategory: "Stationery", childCategory: "Diaries", price: "₹400", sw: 0 },
  { id: "pen", g: "", brand: "", nm: "Metal Pen", category: "Accessories", subcategory: "Stationery", childCategory: "Pens & Pencils", price: "₹200", sw: 0 },
  { id: "tote", g: "", brand: "", nm: "Canvas Tote", category: "Accessories", subcategory: "Bags", childCategory: "Totes", price: "₹400", sw: 0 },
  { id: "laptop-bag", g: "", brand: "", nm: "Work Laptop Bag", category: "Accessories", subcategory: "Bags", childCategory: "Laptop Bags", price: "₹1200", sw: 0 },
  { id: "generic-bag", g: "", brand: "", nm: "Everyday Carry", category: "Accessories", subcategory: "Bags", price: "₹800", sw: 0 },
  { id: "massager", g: "", brand: "", nm: "Neck & Shoulder Massager", category: "Accessories", subcategory: "Travel Accessories", price: "₹1500", sw: 0 },
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
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/apps/catalog/category/:category" element={<Page />} /><Route path="/app/catalog/category/:category" element={<Page />} /></Routes></MemoryRouter>);
}
afterEach(cleanup);

describe("category shopping flow", () => {
  it.each(["/app/catalog", "/apps/catalog"])("opens the flat Travel Accessories collection and its products under %s", (home) => {
    open(`${home}/category/travel-accessories`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Travel Accessories");
    const essentials = screen.getByRole("region", { name: "Travel essentials" });
    expect(within(essentials).getByRole("link", { name: "View Neck & Shoulder Massager" }).getAttribute("href")).toBe(`${home}/massager`);
    expect(within(essentials).queryByRole("link", { name: "View Ceramic Mug" })).toBeNull();
    expect(screen.getByRole("link", { name: /Explore custom kits/ }).getAttribute("href")).toBe(`${home}/category/kits`);
    fireEvent.click(screen.getByRole("link", { name: "View all Travel Accessories" }));
    expect(screen.getByRole("status").textContent).toBe("1 product");
    expect(screen.getByRole("link", { name: "View Neck & Shoulder Massager" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Work Laptop Bag" })).toBeNull();
  });
  it.each(["/app/catalog", "/apps/catalog"])("supports Bags types, promotions and all products under %s", (home) => {
    open(`${home}/category/bags`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Bags");
    expect(screen.queryByRole("link", { name: "Bags category Bags" })).toBeNull();
    expect(screen.getByRole("link", { name: /Shop by use case/ }).getAttribute("href")).toBe("/request-demo");
    expect(screen.getByRole("link", { name: /Explore swag management/ }).getAttribute("href")).toBe("/platform");
    expect(screen.getByRole("link", { name: /Explore custom kits/ }).getAttribute("href")).toBe(`${home}/category/kits`);
    fireEvent.click(screen.getByRole("link", { name: "Totes category Totes" }));
    expect(screen.getByRole("link", { name: "View Canvas Tote" }).getAttribute("href")).toBe(`${home}/tote`);
    expect(screen.queryByRole("link", { name: "View Work Laptop Bag" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Bags" }));
    fireEvent.click(screen.getByRole("link", { name: "View all Bags" }));
    expect(screen.getByRole("status").textContent).toBe("3 products");
    expect(screen.getByRole("link", { name: "View Everyday Carry" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Ceramic Mug" })).toBeNull();
  });
  it.each(["/app/catalog", "/apps/catalog"])("shows real Drinkware arrivals and opens newest products under %s", (home) => {
    open(`${home}/category/drinkware`);
    const latest = screen.getByRole("region", { name: "The latest in Drinkware" });
    expect(within(latest).getAllByRole("link", { name: /View (Blue Bottle|Ceramic Mug)/ }).map((link) => link.getAttribute("href"))).toEqual([`${home}/bottle`, `${home}/mug`]);
    expect(within(latest).queryByRole("link", { name: "View Linen Diary" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /New arrivals/ }));
    expect((screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement).value).toBe("newest");
    expect(screen.getByRole("status").textContent).toBe("2 products");
    const results = screen.getByRole("region", { name: "Drinkware products" });
    expect(within(results).getAllByRole("link")[0].getAttribute("href")).toBe(`${home}/bottle`);
  });
  it.each(["/app/catalog", "/apps/catalog"])("supports the Stationery editorial flow under %s", (home) => {
    open(`${home}/category/stationery`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Stationery");
    expect(screen.getByRole("link", { name: /Explore custom kits/ }).getAttribute("href")).toBe(`${home}/category/kits`);
    fireEvent.click(screen.getByRole("link", { name: "Diaries category Diaries" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Diaries");
    expect(screen.getByRole("link", { name: "View Linen Diary" }).getAttribute("href")).toBe(`${home}/diary`);
    expect(screen.queryByRole("link", { name: "View Metal Pen" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Stationery" }));
    fireEvent.click(screen.getByRole("link", { name: "View all Stationery" }));
    expect(screen.getByRole("status").textContent).toBe("2 products");
    expect(screen.queryByRole("link", { name: "View Ceramic Mug" })).toBeNull();
  });
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
