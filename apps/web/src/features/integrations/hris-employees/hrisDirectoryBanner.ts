import type { HrisDirectoryStatus } from "@/services/merge-api";

export function formatDirectorySyncAt(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Renders the backend directory state. Does not infer status from employee rows. */
export function hrisDirectoryBannerText(directory: HrisDirectoryStatus): string | null {
  const syncedAt = formatDirectorySyncAt(directory.lastSuccessfulSyncAt);
  if (directory.state === "syncing") {
    return syncedAt
      ? `Syncing — last successful sync ${syncedAt}`
      : "Syncing — initial sync in progress";
  }
  if (directory.state === "connected") {
    return syncedAt ? `Connected — last synced ${syncedAt}` : "Connected — initial sync pending";
  }
  if (directory.state === "error") {
    return syncedAt ? `Error — last synced ${syncedAt}` : "Error";
  }
  if (directory.state === "disconnected") {
    const when = syncedAt ? ` — last synced ${syncedAt}` : "";
    return `Disconnected${when}. People from the last snapshot are still listed.`;
  }
  return null;
}
