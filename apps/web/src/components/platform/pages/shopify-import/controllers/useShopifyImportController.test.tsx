/** @vitest-environment happy-dom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { importShopify, importShopifyKits, type ShopifyImportStatus } from "@/services/platform-api";
import { useShopifyImportController } from "./useShopifyImportController";

vi.mock("@/services/platform-api", () => ({ importShopify: vi.fn(), importShopifyKits: vi.fn() }));

const partial: ShopifyImportStatus = {
  importJobId: "job-1", status: "processing", domain: "demo.myshopify.com", total: 2,
  imported: 1, updated: 0, skipped: 0, failed: 0,
  items: [{ title: "First tee", status: "imported", kind: "product" }],
};

afterEach(() => { cleanup(); vi.resetAllMocks(); });

function wrapper(kits: boolean) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[kits ? "/platform/kits/import" : "/platform/catalog/import"]}>{children}</MemoryRouter>
  );
}

describe("Shopify import controller", () => {
  it.each([false, true])("keeps busy while snapshots accumulate and retains the final summary (kits=%s)", async (kits) => {
    let finish!: (status: ShopifyImportStatus) => void;
    vi.mocked(kits ? importShopifyKits : importShopify).mockImplementation(async (_domain, _token, onStatus) => {
      onStatus?.(partial);
      return new Promise((resolve) => { finish = resolve; });
    });
    const { result } = renderHook(useShopifyImportController, { wrapper: wrapper(kits) });
    act(() => { result.current.onDomain(" demo "); result.current.onToken('{"access_token":"shpat_test"}'); });
    let running: unknown;
    act(() => { running = result.current.onRun(); });
    expect(result.current.busy).toBe(true);
    expect(result.current.summary).toEqual(partial);
    expect(kits ? importShopifyKits : importShopify).toHaveBeenCalledWith(
      "demo", "shpat_test", expect.any(Function), expect.any(AbortSignal),
    );
    const final = { ...partial, status: "done" as const, skipped: 1 };
    await act(async () => { finish(final); await running; });
    expect(result.current.busy).toBe(false);
    expect(result.current.summary).toEqual(final);
    expect(result.current.error).toBe("");
  });

  it("retains partial results and exposes a job failure message", async () => {
    vi.mocked(importShopify).mockImplementation(async (_domain, _token, onStatus) => {
      onStatus?.(partial);
      throw new Error("Shopify token expired");
    });
    const { result } = renderHook(useShopifyImportController, { wrapper: wrapper(false) });
    await act(async () => { await result.current.onRun(); });
    expect(result.current.busy).toBe(false);
    expect(result.current.summary).toEqual(partial);
    expect(result.current.error).toBe("Shopify token expired");
  });

  it("aborts polling on unmount and prevents duplicate submissions", async () => {
    vi.mocked(importShopify).mockImplementation((_domain, _token, _onStatus, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const { result, unmount } = renderHook(useShopifyImportController, { wrapper: wrapper(false) });
    let running: unknown;
    act(() => { running = result.current.onRun(); result.current.onRun(); });
    expect(importShopify).toHaveBeenCalledOnce();
    const signal = vi.mocked(importShopify).mock.calls[0][3];
    unmount();
    await running;
    expect(signal?.aborted).toBe(true);
  });
});
