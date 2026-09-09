import { describe, expect, it } from "vitest";
import { acquirePublishLock, releasePublishLock } from "./publishLock";

describe("publish lock", () => {
  it("rejects a second Publish click while the first is in flight", () => {
    const lock = { current: false };
    expect(acquirePublishLock(lock)).toBe(true);
    expect(acquirePublishLock(lock)).toBe(false);
    expect(lock.current).toBe(true);
  });

  it("allows another Publish after the first request finishes", () => {
    const lock = { current: false };
    expect(acquirePublishLock(lock)).toBe(true);
    releasePublishLock(lock);
    expect(acquirePublishLock(lock)).toBe(true);
  });
});