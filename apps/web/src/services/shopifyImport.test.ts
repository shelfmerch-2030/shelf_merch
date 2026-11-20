import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { importShopify, importShopifyKits, pollShopifyImport, type ShopifyImportStatus } from "./platform-api";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));

const snapshot = (status: ShopifyImportStatus["status"], count = 0): ShopifyImportStatus => ({
  importJobId: "job-1", status, domain: "demo.myshopify.com", total: 2,
  imported: count, updated: 0, skipped: 0, failed: 0,
  products: { imported: count, updated: 0, skipped: 0 },
  kits: { imported: 0, updated: 0, skipped: 0 },
  items: Array.from({ length: count }, (_, index) => ({ title: `Tee ${index}`, status: "imported", kind: "product" })),
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.mocked(apiFetch).mockReset(); });

describe("Shopify start and polling", () => {
  it.each([false, true])("starts once and publishes queued, processing and done snapshots (kits=%s)", async (kits) => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ importJobId: "job-1", status: "queued" })
      .mockResolvedValueOnce(snapshot("queued"))
      .mockResolvedValueOnce(snapshot("processing", 1))
      .mockResolvedValueOnce(snapshot("done", 2));
    const onStatus = vi.fn();
    const result = (kits ? importShopifyKits : importShopify)("demo", "shpat_test", onStatus);
    await vi.advanceTimersByTimeAsync(0);
    expect(onStatus).toHaveBeenCalledWith(snapshot("queued"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onStatus).toHaveBeenLastCalledWith(snapshot("processing", 1));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toEqual(snapshot("done", 2));
    expect(onStatus.mock.calls.map(([value]) => value.status)).toEqual(["queued", "processing", "done"]);
    const base = `/platform/${kits ? "kits" : "products"}/import/shopify`;
    expect(apiFetch).toHaveBeenNthCalledWith(1, base, expect.objectContaining({
      method: "POST", body: JSON.stringify({ domain: "demo", accessToken: "shpat_test" }),
    }));
    expect(apiFetch).toHaveBeenLastCalledWith(`${base}/job-1/status`, expect.objectContaining({ cache: "no-store" }));
    expect(apiFetch).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("publishes partial results on fatal failure and throws the job error", async () => {
    const failed = { ...snapshot("failed", 1), error: "Shopify token has expired" };
    vi.mocked(apiFetch).mockResolvedValue(failed);
    const onStatus = vi.fn();
    await expect(pollShopifyImport("job-1", { onStatus })).rejects.toThrow(failed.error);
    expect(onStatus).toHaveBeenCalledWith(failed);
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries transient polling failures without restarting the import", async () => {
    vi.mocked(apiFetch)
      .mockRejectedValueOnce({ status: 504 })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(snapshot("done", 2));
    const result = pollShopifyImport("job-1");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toEqual(snapshot("done", 2));
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(apiFetch).mock.calls.every(([path]) => path.endsWith("/status"))).toBe(true);
  });

  it("stops immediately for authorization errors", async () => {
    const error = Object.assign(new Error("Please sign in again"), { status: 401 });
    vi.mocked(apiFetch).mockRejectedValue(error);
    await expect(pollShopifyImport("job-1")).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops at 30 minutes with a useful timeout and job reference", async () => {
    vi.mocked(apiFetch).mockResolvedValue(snapshot("processing", 1));
    const result = expect(pollShopifyImport("job-1")).rejects.toThrow(/30 minutes.*job-1/);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    await result;
    expect(apiFetch).toHaveBeenCalledTimes(1_800);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a pending wait when leaving the page", async () => {
    vi.mocked(apiFetch).mockResolvedValue(snapshot("processing", 1));
    const controller = new AbortController();
    const result = pollShopifyImport("job-1", { signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
