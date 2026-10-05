import { describe, expect, it } from "vitest";
import type { HrisDirectoryStatus } from "@/services/merge-api";
import { formatDirectorySyncAt, hrisDirectoryBannerText } from "./hrisDirectoryBanner";

const TODAY = "2026-10-05T08:38:00.000Z";
const STALE = "2026-09-30T10:29:00.000Z";

function status(partial: Partial<HrisDirectoryStatus>): HrisDirectoryStatus {
  return {
    state: "empty",
    lastSuccessfulSyncAt: null,
    retainSnapshot: false,
    ...partial,
  };
}

describe("hris directory banner", () => {
  it("shows a connected provider with the exact successful sync time", () => {
    const text = hrisDirectoryBannerText(
      status({ state: "connected", lastSuccessfulSyncAt: TODAY }),
    );
    expect(text).toBe(`Connected — last synced ${formatDirectorySyncAt(TODAY)}`);
    expect(text).not.toContain("People from the last snapshot");
  });

  it("shows syncing with the previous successful time", () => {
    expect(
      hrisDirectoryBannerText(status({ state: "syncing", lastSuccessfulSyncAt: TODAY })),
    ).toBe(`Syncing — last successful sync ${formatDirectorySyncAt(TODAY)}`);
  });

  it("shows initial sync copy when no successful sync exists", () => {
    expect(hrisDirectoryBannerText(status({ state: "connected" }))).toBe(
      "Connected — initial sync pending",
    );
    expect(hrisDirectoryBannerText(status({ state: "syncing" }))).toBe(
      "Syncing — initial sync in progress",
    );
  });

  it("shows the snapshot sentence only for a disconnected directory", () => {
    expect(
      hrisDirectoryBannerText(
        status({ state: "disconnected", lastSuccessfulSyncAt: STALE, retainSnapshot: true }),
      ),
    ).toBe(
      `Disconnected — last synced ${formatDirectorySyncAt(STALE)}. People from the last snapshot are still listed.`,
    );
  });

  it("does not invent a banner when there is no connection", () => {
    expect(hrisDirectoryBannerText(status({ state: "empty" }))).toBeNull();
  });
});
