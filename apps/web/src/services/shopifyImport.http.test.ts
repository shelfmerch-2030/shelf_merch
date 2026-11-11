import { afterEach, describe, expect, it, vi } from "vitest";
import { importShopify, importShopifyKits } from "./platform-api";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Shopify import HTTP contract", () => {
  it.each([false, true])("reads the 202 job id and polls through a gateway blip using GET (kits=%s)", async (kits) => {
    vi.useFakeTimers();
    const final = {
      importJobId: "abc123", status: "done", domain: "demo.myshopify.com", total: 1,
      imported: 1, updated: 0, skipped: 0, failed: 0,
      items: [{ title: "Tee", status: "imported", kind: "product" }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ importJobId: "abc123", status: "queued" }), { status: 202 }))
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(final), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onStatus = vi.fn();
    const running = (kits ? importShopifyKits : importShopify)("demo", "shpat_test", onStatus);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await running).toEqual(final);
    const base = `/platform/${kits ? "kits" : "products"}/import/shopify`;
    expect(fetchMock.mock.calls[0][0]).toContain(base);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ domain: "demo", accessToken: "shpat_test" }) });
    expect(fetchMock.mock.calls.slice(1).every(([url, options]) =>
      String(url).endsWith(`${base}/abc123/status`) && !options.body && options.cache === "no-store",
    )).toBe(true);
    expect(onStatus).toHaveBeenCalledExactlyOnceWith(final);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
