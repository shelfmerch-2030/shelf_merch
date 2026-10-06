import { USER_MANAGEMENT_TOOLS } from "./data";

export const SYNC_NOW_HELPER =
  "Automatic sync is enabled. Use Sync now only if you want to refresh data immediately.";

export type DirectoryConnectionState = "connected" | "syncing" | "disconnected" | "attention";

const STATUS_COPY: Record<DirectoryConnectionState, string> = {
  connected: "Connected employee data syncs automatically.",
  syncing: "Syncing employee data\u2026 No action is required.",
  disconnected:
    "Disconnected \u2014 automatic syncing has stopped. Previously synced people may still be visible.",
  attention: "Connection needs attention. Review the connection to resume automatic syncing.",
};

export function directoryConnectionStatus(input: {
  syncing: boolean;
  needsAttention: boolean;
  disconnected: boolean;
  connected: boolean;
}): { message: string; kind: DirectoryConnectionState } | null {
  if (input.needsAttention) return { message: STATUS_COPY.attention, kind: "attention" };
  if (input.syncing) return { message: STATUS_COPY.syncing, kind: "syncing" };
  if (input.disconnected) return { message: STATUS_COPY.disconnected, kind: "disconnected" };
  if (input.connected) return { message: STATUS_COPY.connected, kind: "connected" };
  return null;
}

export type OverviewStep = {
  title: string;
  body: string;
};

const HR_PROVIDER_IDS = [
  "workday",
  "bamboohr",
  "gusto",
  "keka",
  "deel",
  "ukg-pro",
  "hibob",
  "zoho-people",
] as const;

export function integrationOverviewSteps(providerId: string, providerName: string): OverviewStep[] {
  const directory = providerId === "google-workspace";
  const opening = directory
    ? `Connect ${providerName} once and ShelfMerch will automatically keep your company directory in sync.`
    : `Connect ${providerName} once and ShelfMerch will automatically keep your employee directory in sync.`;

  return [
    { title: `Connect ${providerName} once`, body: opening },
    {
      title: directory ? "Automatic directory sync" : "Automatic employee sync",
      body: directory
        ? "You do not need to click Sync now. Directory changes are synced automatically in the background."
        : "You do not need to click Sync now. Employee changes are synced automatically in the background.",
    },
    {
      title: directory ? "Keep directory details up to date" : "Keep employee details up to date",
      body: directory
        ? "Supported directory details are kept up to date automatically."
        : "Supported employee details, such as names, work emails, departments, job titles, locations, and employment status, are kept up to date automatically.",
    },
    {
      title: directory ? "Use people across ShelfMerch" : "Use employees across ShelfMerch",
      body: directory
        ? "Synced people appear in the Employee Directory and can be used as Workspace Contacts for gifting, onboarding kits, recognition, campaigns, and other merch workflows."
        : "Synced employees appear in the Employee Directory and can be used as Workspace Contacts for gifting, onboarding kits, recognition, campaigns, and other merch workflows.",
    },
    {
      title: "Sync now is optional",
      body: "Use Sync now only when you want to request an immediate refresh. Normal syncing happens automatically.",
    },
    {
      title: "Connection status",
      body: "ShelfMerch shows the current connection state and the latest successful sync time.",
    },
    {
      title: "Disconnect anytime",
      body: directory
        ? `Disconnecting ${providerName} stops future syncs without affecting your other ShelfMerch integrations. Previously synced people may remain visible as the last available snapshot.`
        : `Disconnecting ${providerName} stops future syncs without affecting your other ShelfMerch integrations. Previously synced employees may remain visible as the last available snapshot.`,
    },
  ];
}

export function supportedDirectoryProviderIds(): string[] {
  return USER_MANAGEMENT_TOOLS.map((tile) => tile.id);
}

export { HR_PROVIDER_IDS };
