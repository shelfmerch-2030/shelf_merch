/**
 * Safe parsing of postMessage events from /merge-link-host.html.
 * Only accepts same-origin messages with source "shelfmerch-merge-link".
 */

export const MERGE_LINK_MSG_SOURCE = "shelfmerch-merge-link" as const;

export type MergeLinkHostMessage =
  | { source: typeof MERGE_LINK_MSG_SOURCE; type: "ready" }
  | { source: typeof MERGE_LINK_MSG_SOURCE; type: "exit" }
  | { source: typeof MERGE_LINK_MSG_SOURCE; type: "error"; message?: string }
  | {
      source: typeof MERGE_LINK_MSG_SOURCE;
      type: "success";
      publicToken: string;
    };

export function parseMergeLinkHostMessage(
  event: Pick<MessageEvent, "origin" | "data">,
  expectedOrigin: string,
): MergeLinkHostMessage | null {
  if (event.origin !== expectedOrigin) return null;
  const data = event.data;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.source !== MERGE_LINK_MSG_SOURCE) return null;
  const type = record.type;
  if (type === "ready" || type === "exit") {
    return { source: MERGE_LINK_MSG_SOURCE, type };
  }
  if (type === "error") {
    return {
      source: MERGE_LINK_MSG_SOURCE,
      type: "error",
      message: typeof record.message === "string" ? record.message : undefined,
    };
  }
  if (type === "success" && typeof record.publicToken === "string" && record.publicToken) {
    return {
      source: MERGE_LINK_MSG_SOURCE,
      type: "success",
      publicToken: record.publicToken,
    };
  }
  return null;
}

export function mergeLinkHostUrl(origin: string, linkToken: string): string {
  return `${origin}/merge-link-host.html?linkToken=${encodeURIComponent(linkToken)}`;
}
