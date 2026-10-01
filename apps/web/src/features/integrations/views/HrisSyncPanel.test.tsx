/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { MergeConnectionPublic } from "@/services/merge-api";
import { deriveHrisSyncView } from "../hrisSyncUi";
import { IntegrationDetailView } from "./IntegrationDetailView";
import { HrisSyncPanel } from "./HrisSyncPanel";

afterEach(() => cleanup());

function connection(partial: Partial<MergeConnectionPublic> = {}): MergeConnectionPublic {
  return {
    id: "conn-1",
    provider: "deel",
    category: "hris",
    status: "connected",
    integrationName: "Deel",
    endUserOrganizationName: null,
    mergeLinkedAccountId: "linked-1",
    connectedAt: "2026-10-01T12:00:00.000Z",
    lastSyncAt: "2026-10-01T14:05:00.000Z",
    lastSyncStatus: "success",
    lastError: null,
    connectedByUserId: "user-1",
    updatedAt: "2026-10-01T14:05:00.000Z",
    ...partial,
  };
}

describe("HRIS sync panel", () => {
  it("lets Sync now queue a manual sync and keeps the button optional", async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    const ui = deriveHrisSyncView({
      providerName: "Deel",
      connection: connection(),
      now: new Date("2026-10-01T14:15:00.000Z"),
    });
    render(<HrisSyncPanel view={ui} providerName="Deel" canManage onSync={onSync} />);
    expect(screen.getByText(/Automatic sync is enabled/)).toBeTruthy();
    expect(screen.getByText(/Use Sync now if you want to refresh employee data immediately/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sync now" }));
    expect(onSync).toHaveBeenCalledOnce();
  });

  it("asks for confirmation before disconnect", async () => {
    const user = userEvent.setup();
    const onDisconnect = vi.fn();
    const ui = deriveHrisSyncView({
      providerName: "Zoho People",
      connection: connection({ provider: "zoho-people" }),
      now: new Date("2026-10-01T14:15:00.000Z"),
    });
    render(
      <HrisSyncPanel view={ui} providerName="Zoho People" canManage onDisconnect={onDisconnect} />,
    );
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByText("Disconnect Zoho People?")).toBeTruthy();
    expect(screen.getByText(/will not be automatically deleted/)).toBeTruthy();
    const confirmButtons = screen.getAllByRole("button", { name: "Disconnect" });
    await user.click(confirmButtons[confirmButtons.length - 1]);
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it("reuses the existing reconnect action", async () => {
    const user = userEvent.setup();
    const onReconnect = vi.fn();
    const ui = deriveHrisSyncView({
      providerName: "Deel",
      connection: connection({ status: "needs_attention", lastError: "MERGE_AUTH_FAILED" }),
      syncStatus: {
        connectionId: "conn-1",
        connectionStatus: "needs_attention",
        lastSyncStatus: "success",
        lastSyncAt: "2026-10-01T14:05:00.000Z",
        lastError: "MERGE_AUTH_FAILED",
        activeRun: null,
        runs: [],
      },
      now: new Date("2026-10-01T14:15:00.000Z"),
    });
    render(
      <HrisSyncPanel view={ui} providerName="Deel" canManage onReconnect={onReconnect} />,
    );
    expect(screen.getByText("Connection: Needs attention")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
  });
});

describe("integration detail keeps directory providers on their own status UI", () => {
  it("does not apply HRIS automatic-sync copy to Google Workspace", () => {
    render(
      <MemoryRouter>
        <IntegrationDetailView
          tile={{ id: "google-workspace", name: "Google Workspace", desc: "Directory" }}
          onBack={() => undefined}
          onInstall={() => undefined}
          onSupport={() => undefined}
          connection={connection({
            provider: "google-workspace",
            category: "directory",
            integrationName: "Google Workspace",
          })}
          canManage
          onSync={() => undefined}
          onDisconnect={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Google Workspace")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.queryByText(/Automatic sync is enabled/)).toBeNull();
    expect(screen.queryByText(/Initial sync in progress/)).toBeNull();
  });

  it("shows HRIS connection health in words, not color alone", () => {
    render(
      <MemoryRouter>
        <IntegrationDetailView
          tile={{ id: "deel", name: "Deel" }}
          onBack={() => undefined}
          onInstall={() => undefined}
          onSupport={() => undefined}
          connection={connection()}
          canManage
          syncStatus={{
            connectionId: "conn-1",
            connectionStatus: "connected",
            lastSyncStatus: "success",
            lastSyncAt: "2026-10-01T14:05:00.000Z",
            lastError: null,
            activeRun: null,
            runs: [],
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/Connected/).length).toBeGreaterThan(0);
    expect(screen.getByText("Connection: Connected")).toBeTruthy();
    expect(screen.getByText(/Automatic sync is enabled/)).toBeTruthy();
  });
});
