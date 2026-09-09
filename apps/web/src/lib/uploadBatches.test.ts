import { describe, expect, it } from "vitest";
import { MOCKUP_UPLOAD_BUDGET_BYTES, chunkBySize } from "./uploadBatches";

describe("chunkBySize", () => {
  it("keeps a 13-product payload under the nginx-safe budget", () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ id: i, size: 2 * 1024 * 1024 }));
    const batches = chunkBySize(items, (item) => item.size);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      const total = batch.reduce((sum, item) => sum + item.size, 0);
      expect(total).toBeLessThanOrEqual(MOCKUP_UPLOAD_BUDGET_BYTES);
    }
    expect(batches.flat().map((item) => item.id)).toEqual(items.map((item) => item.id));
  });

  it("sends an oversized single item alone", () => {
    const items = [
      { id: "small", size: 1_000_000 },
      { id: "huge", size: MOCKUP_UPLOAD_BUDGET_BYTES + 1 },
    ];
    const batches = chunkBySize(items, (item) => item.size);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toEqual([items[0]]);
    expect(batches[1]).toEqual([items[1]]);
  });

  it("puts several small products in one request", () => {
    const items = [
      { id: 1, size: 500_000 },
      { id: 2, size: 500_000 },
      { id: 3, size: 500_000 },
    ];
    expect(chunkBySize(items, (item) => item.size)).toEqual([items]);
  });
});