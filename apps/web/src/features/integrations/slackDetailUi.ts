/** Slack detail UI helpers — customer-facing labels only (no backend coupling). */

export const SLACK_DETAIL_LEAD =
  "Connect your Slack workspace and choose where ShelfMerch should send updates.";

export const SLACK_NOTIFICATIONS_TITLE = "Notifications";
export const SLACK_NOTIFICATIONS_DESCRIPTION =
  "Choose which ShelfMerch activity should be sent to your Slack channel.";

export const SLACK_NOTIFICATION_TOGGLE_OPTIONS = [
  { key: "walletApproved", label: "Wallet funded" },
  { key: "budgetAssigned", label: "Budget assigned" },
  { key: "lowBudget", label: "Low budget alerts" },
  { key: "pointsDistributed", label: "Points distributed" },
  { key: "kitsAssigned", label: "Kits assigned" },
  { key: "orderDispatched", label: "Order shipped" },
  { key: "deliveryFailed", label: "Delivery issue" },
  { key: "shopLaunched", label: "Shop launched" },
] as const;

export type SlackNotificationToggleKey =
  (typeof SLACK_NOTIFICATION_TOGGLE_OPTIONS)[number]["key"];

export function formatSlackChannelLabel(name: string | null | undefined): string {
  if (!name) return "Not selected";
  return name.startsWith("#") ? name : `#${name}`;
}

/** Dropdown option text — never append invite-bot / membership hints. */
export function slackChannelOptionLabel(channel: { name: string }): string {
  return formatSlackChannelLabel(channel.name);
}

export function canSaveSlackChannel(opts: {
  draftId: string;
  defaultChannelId: string | null | undefined;
}): boolean {
  const draft = opts.draftId.trim();
  if (!draft) return false;
  return draft !== (opts.defaultChannelId || "");
}

export function canSendSlackTestMessage(defaultChannelId: string | null | undefined): boolean {
  return Boolean(defaultChannelId);
}

export function resolveSlackNotificationPrefs(connection: {
  notifications?: Partial<Record<SlackNotificationToggleKey, boolean>> | null;
  notifyOrderDispatched?: boolean;
} | null | undefined): Record<SlackNotificationToggleKey, boolean> {
  const base: Record<SlackNotificationToggleKey, boolean> = {
    walletApproved: true,
    budgetAssigned: true,
    lowBudget: true,
    pointsDistributed: true,
    kitsAssigned: true,
    orderDispatched: true,
    deliveryFailed: true,
    shopLaunched: true,
  };
  if (!connection) return base;
  const n = connection.notifications || {};
  for (const key of Object.keys(base) as SlackNotificationToggleKey[]) {
    if (typeof n[key] === "boolean") base[key] = n[key]!;
  }
  if (typeof n.orderDispatched !== "boolean" && typeof connection.notifyOrderDispatched === "boolean") {
    base.orderDispatched = connection.notifyOrderDispatched;
  }
  return base;
}