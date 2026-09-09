import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UiProduct } from "./mappers";

vi.mock("./api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, message: string, code = "API_ERROR") {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

import { apiFetch } from "./api";
import { createCollectionApi, updateCollectionApi, uploadCollectionMockupsApi } from "./mutations-api";

const apiFetchMock = vi.mocked(apiFetch);

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function product(id: string, name: string): UiProduct {
  return { id, g: "tee", brand: "Rubix", nm: name, price: "499", sw: 1 };
}

function collectionDoc(id: string, catalog: UiProduct[], mockupUrls: string[] = []) {
  return {
    _id: id,
    name: "Sushant Collection",
    status: "draft",
    productRefs: catalog.map((p, i) => ({
      catalogProductId: p.id,
      name: p.nm,
      mockupUrl: mockupUrls[i] || "",
    })),
  };
}

describe("collection mockup batching and publish rollback", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("uploads a single product mockup in one request", async () => {
    const catalog = [product("aaaaaaaaaaaaaaaaaaaaaaaa", "Mug")];
    apiFetchMock.mockResolvedValueOnce(collectionDoc("col1", catalog, ["/uploads/m1.png"]));
    const result = await uploadCollectionMockupsApi("col1", [
      { catalogProductId: catalog[0].id!, dataUrl: PNG },
    ]);
    expect(result?.products[0].mockupUrl).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(String(apiFetchMock.mock.calls[0][0])).toContain("/collections/col1/mockups");
  });

  it("uploads 13 products as sequential mockup batches under a tiny budget", async () => {
    const catalog = Array.from({ length: 13 }, (_, i) =>
      product(i.toString().padStart(24, "a"), `Product ${i + 1}`),
    );
    const items = catalog.map((p) => ({ catalogProductId: p.id!, dataUrl: PNG }));
    let uploaded = 0;
    apiFetchMock.mockImplementation(async () => {
      uploaded += 1;
      return collectionDoc(
        "col13",
        catalog,
        catalog.map((_, i) => (i < uploaded ? `/uploads/m${i}.png` : "")),
      );
    });

    const result = await uploadCollectionMockupsApi("col13", items, undefined, { budgetBytes: 1 });
    expect(apiFetchMock).toHaveBeenCalledTimes(13);
    expect(result?.products).toHaveLength(13);
    for (const call of apiFetchMock.mock.calls) {
      expect(String(call[0])).toContain("/collections/col13/mockups");
      expect(call[1]?.method).toBe("POST");
      expect(call[1]?.body).toBeInstanceOf(FormData);
    }
  });

  it("rolls back a new collection if a mockup batch fails", async () => {
    const catalog = [product("bbbbbbbbbbbbbbbbbbbbbbbb", "Tote"), product("cccccccccccccccccccccccc", "Cap")];
    apiFetchMock.mockImplementation(async (path, options) => {
      if (path === "/collections" && options?.method === "POST") {
        return collectionDoc("new-col", catalog);
      }
      if (String(path).includes("/mockups")) {
        throw new Error("upload failed");
      }
      if (String(path) === "/collections/new-col" && options?.method === "DELETE") {
        return undefined;
      }
      throw new Error(`unexpected ${options?.method} ${path}`);
    });

    await expect(
      createCollectionApi({
        name: "Sushant Collection",
        pickedIndices: [0, 1],
        catalog,
        mockups: catalog.map((p) => ({ catalogProductId: p.id!, dataUrl: PNG })),
        shopIds: ["shop1"],
      }),
    ).rejects.toThrow("upload failed");

    expect(apiFetchMock.mock.calls.some((c) => c[0] === "/collections" && c[1]?.method === "POST")).toBe(
      true,
    );
    expect(apiFetchMock.mock.calls.some((c) => c[0] === "/collections/new-col" && c[1]?.method === "DELETE")).toBe(
      true,
    );
    expect(apiFetchMock.mock.calls.some((c) => String(c[0]).includes("/publish"))).toBe(false);
  });

  it("rolls back a new collection if shop publish fails after mockups succeed", async () => {
    const catalog = [product("dddddddddddddddddddddddd", "Bottle")];
    apiFetchMock.mockImplementation(async (path, options) => {
      if (path === "/collections" && options?.method === "POST") {
        return collectionDoc("new-col", catalog);
      }
      if (String(path).includes("/mockups")) {
        return collectionDoc("new-col", catalog, ["/uploads/m.png"]);
      }
      if (String(path).includes("/publish")) {
        throw new Error("shop publish failed");
      }
      if (String(path) === "/collections/new-col" && options?.method === "DELETE") {
        return undefined;
      }
      throw new Error(`unexpected ${options?.method} ${path}`);
    });

    await expect(
      createCollectionApi({
        name: "Sushant Collection",
        pickedIndices: [0],
        catalog,
        mockups: [{ catalogProductId: catalog[0].id!, dataUrl: PNG }],
        shopIds: ["shop1"],
      }),
    ).rejects.toThrow("shop publish failed");

    expect(apiFetchMock.mock.calls.some((c) => String(c[0]).includes("/publish"))).toBe(true);
    expect(apiFetchMock.mock.calls.some((c) => c[0] === "/collections/new-col" && c[1]?.method === "DELETE")).toBe(
      true,
    );
  });

  it("does not delete an existing collection when re-publishing fails", async () => {
    const catalog = [product("eeeeeeeeeeeeeeeeeeeeeeee", "Cap")];
    apiFetchMock.mockImplementation(async (path, options) => {
      if (String(path) === "/collections/existing" && options?.method === "PATCH") {
        return collectionDoc("existing", catalog);
      }
      if (String(path).includes("/mockups")) {
        throw new Error("upload failed");
      }
      throw new Error(`unexpected ${options?.method} ${path}`);
    });

    await expect(
      updateCollectionApi({
        collectionId: "existing",
        name: "Sushant Collection",
        pickedIndices: [0],
        catalog,
        mockups: [{ catalogProductId: catalog[0].id!, dataUrl: PNG }],
      }),
    ).rejects.toThrow("upload failed");

    expect(apiFetchMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false);
  });
});