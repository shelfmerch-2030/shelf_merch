// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { useCatalogController } from "./useCatalogController";
import { ALL_PRODUCTS, FALLBACK_CATALOG_NODES } from "../types";

vi.mock("@/hooks/useWorkspace", () => ({ useWorkspace: () => ({ data: undefined }) }));
vi.mock("../model", () => ({
  useCatalogCategoryTree: () => ({ data: FALLBACK_CATALOG_NODES }),
  useCatalog: () => ({ data: { items: [], total: 0 }, isLoading: false, isError: false, isFetching: false }),
}));

function Navigation() {
  const vm = useCatalogController();
  const location = useLocation();
  return <>
    <output aria-label="Current URL">{location.pathname}{location.search}</output>
    <output aria-label="Selected category">{vm.parent}</output>
    <button onClick={() => vm.onCategory("Kits")}>Kits</button>
    <button onClick={() => vm.onCategory("Apparel")}>Apparel</button>
    <button onClick={() => vm.onCategory(ALL_PRODUCTS)}>All products</button>
  </>;
}

afterEach(cleanup);

describe("catalog category navigation", () => {
  it.each(["/husain/catalog", "/dashboard/catalog", "/app/catalog", "/apps/catalog"])(
    "keeps category changes and query parameters under %s",
    (home) => {
      render(<MemoryRouter initialEntries={[`${home}?category=Apparel&sort=newest`]}><Routes>
        <Route path={`${home}/*`} element={<Navigation />} />
      </Routes></MemoryRouter>);
      expect(screen.getByLabelText("Selected category").textContent).toBe("Apparel");
      fireEvent.click(screen.getByRole("button", { name: "All products" }));
      expect(screen.getByLabelText("Current URL").textContent).toBe(`${home}/category/all-products?sort=newest`);
      for (const category of ["Kits", "Apparel"]) {
        fireEvent.click(screen.getByRole("button", { name: category }));
        expect(screen.getByLabelText("Current URL").textContent).toBe(`${home}/category/${category.toLowerCase()}`);
      }
    },
  );
});
