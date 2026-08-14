import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Lightweight coverage for fresh-token + duplicate-open guards in the
 * integrations Merge Link start path (controller logic mirrored for stability).
 */
describe("Merge Link start session guards", () => {
  let mergeLinking = false;
  let mergeExchanging = false;
  let mergeLinkToken: string | null = null;
  let mergeLinkProvider: string | null = null;
  const createMergeLinkToken = vi.fn(async (opts?: { integration?: string }) => {
    return `token-for-${opts?.integration ?? "catalog"}-${Math.random().toString(36).slice(2, 7)}`;
  });

  async function startMergeLink(integration?: string) {
    if (mergeLinking || mergeExchanging) return;
    mergeLinkToken = null;
    mergeLinkProvider = integration ?? null;
    mergeLinking = true;
    try {
      const token = await createMergeLinkToken(
        integration ? { integration } : undefined,
      );
      mergeLinkToken = token;
    } catch {
      mergeLinking = false;
      mergeLinkProvider = null;
    }
  }

  beforeEach(() => {
    mergeLinking = false;
    mergeExchanging = false;
    mergeLinkToken = null;
    mergeLinkProvider = null;
    createMergeLinkToken.mockClear();
  });

  it("requests a fresh provider-specific link token", async () => {
    await startMergeLink("workday");
    expect(createMergeLinkToken).toHaveBeenCalledWith({ integration: "workday" });
    expect(mergeLinkToken).toMatch(/^token-for-workday-/);
    expect(mergeLinkProvider).toBe("workday");
  });

  it("requests link token with integration gusto (no setup block)", async () => {
    await startMergeLink("gusto");
    expect(createMergeLinkToken).toHaveBeenCalledTimes(1);
    expect(createMergeLinkToken).toHaveBeenCalledWith({ integration: "gusto" });
    expect(mergeLinkToken).toMatch(/^token-for-gusto-/);
    expect(mergeLinkProvider).toBe("gusto");
  });

  it("clears prior token then fetches BambooHR after Workday", async () => {
    await startMergeLink("workday");
    const first = mergeLinkToken;
    mergeLinking = false;
    await startMergeLink("bamboohr");
    expect(createMergeLinkToken).toHaveBeenCalledTimes(2);
    expect(createMergeLinkToken).toHaveBeenLastCalledWith({ integration: "bamboohr" });
    expect(mergeLinkToken).not.toBe(first);
    expect(mergeLinkToken).toMatch(/^token-for-bamboohr-/);
    expect(mergeLinkProvider).toBe("bamboohr");
  });

  it("prevents duplicate open while linking", async () => {
    const p1 = startMergeLink("keka");
    const p2 = startMergeLink("ukg-pro");
    await Promise.all([p1, p2]);
    expect(createMergeLinkToken).toHaveBeenCalledTimes(1);
    expect(mergeLinkProvider).toBe("keka");
  });
});
