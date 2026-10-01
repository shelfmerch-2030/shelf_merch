import { describe, expect, it } from "vitest";
import { mergeSyncErrorMessage } from "@/services/merge-api";
import type { MergeSyncRunPublic, MergeSyncStatusPublic } from "@/services/merge-api";
import {
  HRIS_SYNC_POLL_MS,
  deriveHrisSyncView,
  hrisDisconnectCopy,
  mergeSafeErrorMessage,
  safeRunDetailLines,
  shouldPollHrisSync,
  usesHrisAutomaticSyncUi,
} from "./hrisSyncUi";

const NOW = new Date("2026-10-01T14:15:00.000Z");

function models(partial: Partial<MergeSyncRunPublic["models"]> = {}): MergeSyncRunPublic["models"] {
  return {
    employee: null,
    employment: null,
    group: null,
    location: null,
    contact: null,
    ...partial,
  };
}

function run(partial: Partial<MergeSyncRunPublic> & { id?: string } = {}): MergeSyncRunPublic {
  return {
    id: partial.id || "run-1",
    connectionId: "conn-1",
    reason: partial.reason || "manual",
    mode: partial.mode ?? "full",
    status: partial.status || "success",
    startedAt: partial.startedAt ?? null,
    finishedAt: partial.finishedAt ?? null,
    lastProgressAt: partial.lastProgressAt ?? null,
    durationMs: partial.durationMs ?? null,
    retryCount: 0,
    workerAttempt: 1,
    rateLimitCount: 0,
    errorCode: partial.errorCode ?? null,
    failedModel: partial.failedModel ?? null,
    models: partial.models || models(),
  };
}

function status(partial: Partial<MergeSyncStatusPublic> = {}): MergeSyncStatusPublic {
  return {
    connectionId: "conn-1",
    connectionStatus: partial.connectionStatus || "connected",
    lastSyncStatus: partial.lastSyncStatus || "success",
    lastSyncAt: partial.lastSyncAt ?? null,
    lastSyncRequestedAt: partial.lastSyncRequestedAt ?? null,
    lastSyncStartedAt: partial.lastSyncStartedAt ?? null,
    lastSyncFinishedAt: partial.lastSyncFinishedAt ?? null,
    lastFullSyncAt: partial.lastFullSyncAt ?? null,
    lastError: partial.lastError ?? null,
    activeRun: partial.activeRun ?? null,
    runs: partial.runs ?? [],
  };
}

function view(partial: {
  connection?: { status?: string; lastSyncStatus?: string; lastSyncAt?: string | null; lastError?: string | null; category?: string };
  syncStatus?: MergeSyncStatusPublic | null;
  enqueuePending?: boolean;
  providerName?: string;
}) {
  return deriveHrisSyncView({
    providerName: partial.providerName || "Zoho People",
    connection: {
      status: "connected",
      lastSyncStatus: "success",
      lastSyncAt: "2026-10-01T14:05:00.000Z",
      lastError: null,
      category: "hris",
      ...partial.connection,
    },
    syncStatus: partial.syncStatus,
    enqueuePending: partial.enqueuePending,
    now: NOW,
  });
}

describe("HRIS sync status UX", () => {
  it("shows an automatic initial sync for a newly connected HRIS", () => {
    const ui = view({
      connection: { lastSyncAt: null, lastSyncStatus: "queued" },
      syncStatus: status({
        lastSyncStatus: "queued",
        lastSyncAt: null,
        activeRun: run({ status: "queued", reason: "initial" }),
      }),
    });
    expect(ui.headline).toBe("Preparing initial sync");
    expect(ui.lead).toContain("You can leave this page");
    expect(ui.automaticEnabled).toBe(true);
    expect(ui.syncButtonLabel).toBe("Queued");
    expect(ui.syncButtonDisabled).toBe(true);
    expect(ui.polling).toBe(true);
    expect(ui.lastSyncedLabel).toBe("Initial sync in progress");
  });

  it("shows automatic sync as enabled when a connection is idle", () => {
    const ui = view({
      syncStatus: status({ lastSyncAt: "2026-10-01T14:05:00.000Z", lastSyncStatus: "success" }),
    });
    expect(ui.connectionLine).toBe("Connection: Connected");
    expect(ui.headline).toBe("Up to date");
    expect(ui.automaticEnabled).toBe(true);
    expect(ui.syncButtonLabel).toBe("Sync now");
    expect(ui.syncButtonDisabled).toBe(false);
    expect(ui.polling).toBe(false);
  });

  it("treats Sync now as an optional queued manual sync", () => {
    const ui = view({ enqueuePending: true });
    expect(ui.syncButtonLabel).toBe("Queued");
    expect(ui.headline).toBe("Queued");
    expect(ui.polling).toBe(true);
    expect(ui.banner || "").not.toMatch(/fail/i);
  });

  it("shows already queued work as active instead of a failure", () => {
    const ui = view({
      connection: { lastSyncStatus: "queued" },
      syncStatus: status({
        lastSyncStatus: "queued",
        activeRun: run({ status: "queued", reason: "manual" }),
      }),
    });
    expect(ui.syncButtonLabel).toBe("Queued");
    expect(ui.connectionWord).toBe("Connected");
    expect(ui.banner).toBeNull();
  });

  it("polls while queued or syncing and stops after success or failure", () => {
    expect(HRIS_SYNC_POLL_MS).toBeGreaterThanOrEqual(3000);
    expect(HRIS_SYNC_POLL_MS).toBeLessThanOrEqual(5000);
    expect(shouldPollHrisSync(status({ lastSyncStatus: "queued", activeRun: run({ status: "queued" }) }))).toBe(true);
    expect(shouldPollHrisSync(status({ lastSyncStatus: "syncing", activeRun: run({ status: "running" }) }))).toBe(true);
    expect(shouldPollHrisSync(status({ lastSyncStatus: "success", activeRun: null }))).toBe(false);
    expect(shouldPollHrisSync(status({ lastSyncStatus: "failed", activeRun: null }))).toBe(false);
    expect(view({
      syncStatus: status({
        lastSyncStatus: "syncing",
        activeRun: run({ status: "running", reason: "webhook" }),
      }),
    }).polling).toBe(true);
  });

  it("restores a syncing state from the backend when the page is reopened", () => {
    const ui = view({
      enqueuePending: false,
      syncStatus: status({
        lastSyncStatus: "syncing",
        activeRun: run({
          status: "running",
          reason: "manual",
          models: models({
            employee: { status: "running", pagesProcessed: 12, recordsProcessed: 2400 },
          }),
        }),
      }),
    });
    expect(ui.headline).toBe("Syncing…");
    expect(ui.syncButtonLabel).toBe("Syncing…");
    expect(ui.progressLines.join(" ")).toContain("2,400 employees processed");
    expect(ui.progressLines.join(" ")).toContain("12 pages completed");
    expect(ui.progressLines.join(" ")).toContain("Employees");
    expect(ui.progressLines.join(" ")).not.toMatch(/%|cursor/i);
  });

  it("keeps the connection connected when the latest sync failed", () => {
    const ui = view({
      syncStatus: status({
        connectionStatus: "connected",
        lastSyncStatus: "failed",
        lastError: "MERGE_RATE_LIMITED",
        lastSyncAt: "2026-10-01T13:00:00.000Z",
      }),
    });
    expect(ui.connectionWord).toBe("Connected");
    expect(ui.syncLine).toBe("Last sync: Failed");
    expect(ui.showReconnect).toBe(false);
    expect(ui.banner).toContain("still active");
    expect(ui.syncButtonLabel).toBe("Try again");
  });

  it("does not ask the user to reconnect after a temporary failure", () => {
    for (const code of ["MERGE_RATE_LIMITED", "MERGE_UNREACHABLE", "MERGE_UPSTREAM_ERROR"]) {
      const ui = view({
        syncStatus: status({ lastSyncStatus: "failed", lastError: code, connectionStatus: "connected" }),
      });
      expect(ui.showReconnect).toBe(false);
      expect(ui.connectionWord).toBe("Connected");
      expect(ui.banner).not.toMatch(/reconnect/i);
    }
  });

  it("shows reconnect when the connection needs attention", () => {
    const ui = view({
      providerName: "Deel",
      connection: { status: "needs_attention", lastSyncStatus: "success" },
      syncStatus: status({
        connectionStatus: "needs_attention",
        lastSyncStatus: "success",
        lastSyncAt: "2026-10-01T14:05:00.000Z",
        lastError: "MERGE_AUTH_FAILED",
      }),
    });
    expect(ui.connectionWord).toBe("Needs attention");
    expect(ui.headline).toBe("Needs attention");
    expect(ui.showReconnect).toBe(true);
    expect(ui.automaticEnabled).toBe(false);
    expect(ui.syncLine).toBe("Last sync: Successful");
    expect(ui.lead).toContain("Deel");
  });

  it("explains a required employee permission failure without calling the provider disconnected", () => {
    const ui = view({
      syncStatus: status({
        connectionStatus: "needs_attention",
        lastSyncStatus: "failed",
        lastError: "MERGE_SCOPES_DISABLED",
      }),
    });
    expect(ui.connectionWord).not.toBe("Disconnected");
    expect(ui.lead).toContain("Employee access is not enabled");
    expect(ui.showReconnect).toBe(true);
  });

  it("shows optional scope limits as a warning on a connected integration", () => {
    const ui = view({
      syncStatus: status({
        connectionStatus: "connected",
        lastSyncStatus: "success",
        lastError: "MERGE_OPTIONAL_SCOPE_DISABLED",
        lastSyncAt: "2026-10-01T14:05:00.000Z",
      }),
    });
    expect(ui.connectionWord).toBe("Connected");
    expect(ui.showReconnect).toBe(false);
    expect(ui.banner).toContain("Connected with limited access");
    expect(ui.bannerTone).toBe("info");
  });

  it("requires confirmation copy before disconnect and turns automatic sync off afterward", () => {
    const copy = hrisDisconnectCopy("Zoho People");
    expect(copy.title).toBe("Disconnect Zoho People?");
    expect(copy.description).toContain("Automatic employee syncing will stop");
    expect(copy.description).toContain("will not be automatically deleted");
    const ui = view({
      connection: { status: "disconnected", lastSyncStatus: "idle", lastSyncAt: "2026-10-01T12:00:00.000Z" },
      syncStatus: status({ connectionStatus: "disconnected", lastSyncStatus: "idle", lastSyncAt: "2026-10-01T12:00:00.000Z" }),
    });
    expect(ui.connectionWord).toBe("Disconnected");
    expect(ui.automaticEnabled).toBe(false);
    expect(ui.showConnect).toBe(true);
    expect(ui.showSyncButton).toBe(false);
  });

  it("shows a queued recovery sync after reconnect without clearing history", () => {
    const previous = run({
      id: "old",
      reason: "webhook",
      status: "success",
      finishedAt: "2026-10-01T08:12:00.000Z",
      models: models({ employee: { status: "success", pagesProcessed: 1, recordsProcessed: 12 } }),
    });
    const ui = view({
      syncStatus: status({
        connectionStatus: "connected",
        lastSyncStatus: "queued",
        lastSyncAt: "2026-10-01T08:12:00.000Z",
        activeRun: run({ id: "recovery", status: "queued", reason: "manual" }),
        runs: [previous],
      }),
    });
    expect(ui.headline).toBe("Queued");
    expect(ui.polling).toBe(true);
    expect(ui.history).toHaveLength(1);
    expect(ui.history[0].reasonLabel).toBe("Automatic");
    expect(ui.history[0].recordsLabel).toBe("12 records");
  });

  it("updates the last synced label from a successful timestamp and avoids a fake one", () => {
    const synced = view({
      syncStatus: status({ lastSyncStatus: "success", lastSyncAt: "2026-10-01T14:05:00.000Z" }),
    });
    expect(synced.lastSyncedLabel).toBe("Last synced: 10 minutes ago");
    expect(synced.lastSyncedExact).toBeTruthy();
    const never = view({
      connection: { lastSyncAt: null, lastSyncStatus: "idle" },
      syncStatus: status({ lastSyncAt: null, lastSyncStatus: "idle" }),
    });
    expect(never.headline).toBe("Not synced yet");
    expect(never.lastSyncedLabel).toBe("Not synced yet");
    expect(never.lastSyncedExact).toBeNull();
  });

  it("renders recent sync history with user-facing reasons and safe details", () => {
    const secretRun = {
      ...run({
        id: "hist",
        reason: "scheduled",
        mode: "incremental",
        status: "failed",
        startedAt: "2026-10-01T08:00:00.000Z",
        finishedAt: "2026-10-01T08:02:00.000Z",
        durationMs: 125000,
        errorCode: "MERGE_UPSTREAM_ERROR",
        failedModel: "employment",
        models: models({
          employee: { status: "success", pagesProcessed: 4, recordsProcessed: 324 },
          employment: { status: "failed", pagesProcessed: 1, recordsProcessed: 10, errorCode: "MERGE_UPSTREAM_ERROR" },
        }),
      }),
      accountToken: "token-should-not-render",
      employees: [{ email: "person@example.com", name: "Hidden Person" }],
      jobId: "merge-hris-sync:conn-1",
    };
    const lines = safeRunDetailLines(secretRun);
    const blob = lines.join("\n");
    expect(blob).toContain("Reason: Scheduled sync");
    expect(blob).toContain("Sync type: Incremental");
    expect(blob).toContain("Records processed: 334");
    expect(blob).toContain("Model: Employments");
    expect(blob).toContain("Error code: MERGE_UPSTREAM_ERROR");
    expect(blob).not.toContain("token-should-not-render");
    expect(blob).not.toContain("person@example.com");
    expect(blob).not.toContain("Hidden Person");
    expect(blob).not.toContain("merge-hris-sync");
    const ui = view({
      syncStatus: status({
        runs: [
          run({
            reason: "initial",
            status: "running",
            startedAt: "2026-10-01T14:10:00.000Z",
            models: models(),
          }),
        ],
      }),
    });
    expect(ui.history[0].reasonLabel).toBe("Initial sync");
    expect(ui.history[0].recordsLabel).not.toContain("0 records");
  });

  it("maps queue and stale errors without claiming the HRMS is disconnected", () => {
    expect(mergeSafeErrorMessage("MERGE_QUEUE_UNAVAILABLE")).toBe(
      "Sync could not be started right now. Please try again shortly.",
    );
    expect(mergeSyncErrorMessage({ code: "MERGE_QUEUE_UNAVAILABLE" })).toBe(
      "Sync could not be started right now. Please try again shortly.",
    );
    const stale = view({
      syncStatus: status({
        connectionStatus: "connected",
        lastSyncStatus: "failed",
        lastError: "MERGE_SYNC_STALE",
      }),
    });
    expect(stale.connectionWord).toBe("Connected");
    expect(stale.banner).toContain("stopped unexpectedly");
    expect(stale.banner).not.toMatch(/disconnected/i);
    expect(stale.showReconnect).toBe(false);
    expect(mergeSafeErrorMessage("MERGE_UNKNOWN_CODE")).toBe("The latest sync could not complete.");
  });

  it("uses words for status and keeps HRIS copy off directory integrations", () => {
    const connected = view({});
    const attention = view({
      syncStatus: status({ connectionStatus: "needs_attention", lastError: "MERGE_AUTH_FAILED" }),
    });
    const disconnected = view({
      syncStatus: status({ connectionStatus: "disconnected", lastSyncStatus: "idle" }),
    });
    expect(connected.connectionLine).toContain("Connected");
    expect(attention.connectionLine).toContain("Needs attention");
    expect(disconnected.connectionLine).toContain("Disconnected");
    expect(connected.connectionMark).toBe("✓");
    expect(attention.connectionMark).toBe("!");
    expect(disconnected.connectionMark).toBe("○");
    expect(usesHrisAutomaticSyncUi("deel", "hris")).toBe(true);
    expect(usesHrisAutomaticSyncUi("google-workspace", "directory")).toBe(false);
    expect(usesHrisAutomaticSyncUi("slack", null)).toBe(false);
  });

  it("does not present an unfinished initial import as zero employees synced", () => {
    const ui = view({
      connection: { lastSyncAt: null, lastSyncStatus: "syncing" },
      syncStatus: status({
        lastSyncAt: null,
        lastSyncStatus: "syncing",
        activeRun: run({
          status: "running",
          reason: "initial",
          models: models({ employee: { status: "running", pagesProcessed: 0, recordsProcessed: 0 } }),
        }),
      }),
    });
    expect(ui.headline).toBe("Initial sync in progress");
    expect(ui.progressLines.join(" ")).not.toContain("0 employees");
    expect(ui.preparingNote).toBe("Employee data is still being prepared.");
  });
});
