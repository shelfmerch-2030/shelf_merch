// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UiProduct } from "../model";
import { useSwagWizardController } from "./useSwagWizardController";

const fixtures = vi.hoisted(() => ({
  products: [] as UiProduct[],
  searchParams: new URLSearchParams(),
  artwork: { name: "logo.png", preview: "/uploads/logo.png" },
  workspace: { catalogProducts: [], shops: [], collections: [], kits: [] },
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ data: fixtures.workspace, isLoading: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { items: fixtures.products }, isLoading: false }),
}));
vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [fixtures.searchParams],
}));
vi.mock("@/services/api-bridge", () => ({ refreshCatalogProducts: vi.fn() }));
vi.mock("../model", () => ({
  useCreateCollection: () => ({}),
  useUpdateCollection: () => ({}),
  useSyncCollectionPublish: () => ({}),
}));
vi.mock("../wizard/artworkHistory", () => ({
  resolveDefaultArtwork: () => fixtures.artwork,
  buildPreviousUploads: () => [],
}));

function product(id: string, printable = true): UiProduct {
  return {
    id,
    nm: id,
    g: "tee",
    brand: "Test",
    sw: 1,
    price: "0",
    printAreas: printable
      ? [{ key: "front", label: "Front", widthIn: 2, heightIn: 2 }]
      : [],
  } as UiProduct;
}

beforeEach(() => {
  fixtures.products = [product("first"), product("second"), product("plain", false)];
});
afterEach(cleanup);

describe("default artwork on selected products", () => {
  it("brands products selected one at a time, including after returning to product selection", () => {
    const { result } = renderHook(() => useSwagWizardController());
    act(() => result.current.dispatch({ type: "togglePick", index: 0 }));
    expect(result.current.draft.areaArts).toEqual({ "first::front": fixtures.artwork });

    act(() => result.current.onStep(2));
    act(() => result.current.onStep(1));
    act(() => result.current.dispatch({ type: "togglePick", index: 1 }));
    act(() => result.current.dispatch({ type: "togglePick", index: 2 }));
    expect(result.current.draft.areaArts).toEqual({
      "first::front": fixtures.artwork,
      "second::front": fixtures.artwork,
    });
  });

  it("preserves a removed logo while branding the next selected product", () => {
    const { result } = renderHook(() => useSwagWizardController());
    act(() => result.current.dispatch({ type: "togglePick", index: 0 }));
    act(() => result.current.dispatch({ type: "clearAreaArt", key: "first::front" }));
    expect(result.current.draft.areaArts).toEqual({});

    act(() => result.current.dispatch({ type: "togglePick", index: 1 }));
    expect(result.current.draft.areaArts).toEqual({ "second::front": fixtures.artwork });
  });

  it("keeps customized artwork and placement when another product is selected", () => {
    const { result } = renderHook(() => useSwagWizardController());
    act(() => result.current.dispatch({ type: "togglePick", index: 0 }));
    const customArt = { name: "custom.png", preview: "/uploads/custom.png" };
    const placement = { xPct: 55, yPct: 40, wPct: 20, rot: 15 };
    act(() => {
      result.current.dispatch({ type: "setAreaArt", key: "first::front", art: customArt });
      result.current.dispatch({ type: "setPlacement", key: "first::front", placement });
    });

    act(() => result.current.dispatch({ type: "togglePick", index: 1 }));
    expect(result.current.draft.areaArts).toEqual({
      "first::front": customArt,
      "second::front": customArt,
    });
    expect(result.current.draft.placements["first::front"]).toEqual(placement);
  });

  it("brands a selected product when its print areas arrive in a catalog refresh", () => {
    const { result, rerender } = renderHook(() => useSwagWizardController());
    act(() => result.current.dispatch({ type: "togglePick", index: 0 }));
    act(() => result.current.dispatch({ type: "togglePick", index: 2 }));
    expect(result.current.draft.areaArts["plain::front"]).toBeUndefined();

    fixtures.products = [fixtures.products[0], fixtures.products[1], product("plain")];
    rerender();
    expect(result.current.draft.areaArts["plain::front"]).toEqual(fixtures.artwork);
  });
});
