/** Slack detail UI helpers — customer-facing labels only (no backend coupling). */

export const SLACK_DETAIL_LEAD =
  "Connect your Slack workspace and choose where ShelfMerch should send updates.";

export const SLACK_NOTIFICATIONS_TITLE = "Notifications";
export const SLACK_NOTIFICATIONS_DESCRIPTION =
  "Choose which ShelfMerch activity should be sent to your Slack channel.";

export const SLACK_NOTIFICATION_CATEGORIES = [
  "Finance",
  "Rewards",
  "Orders & delivery",
  "Store",
] as const;

export type SlackNotificationCategory = (typeof SLACK_NOTIFICATION_CATEGORIES)[number];

export const SLACK_NOTIFICATION_TOGGLE_OPTIONS = [
  {
    key: "walletApproved",
    label: "Wallet funded",
    description: "Get notified when funds are added",
    category: "Finance",
  },
  {
    key: "budgetAssigned",
    label: "Budget assigned",
    description: "Alerts when budgets are allocated",
    category: "Finance",
  },
  {
    key: "lowBudget",
    label: "Low budget alerts",
    description: "Warnings when budget runs low",
    category: "Finance",
  },
  {
    key: "pointsDistributed",
    label: "Points distributed",
    description: "Updates when points are sent",
    category: "Rewards",
  },
  {
    key: "kitsAssigned",
    label: "Kits assigned",
    description: "When kits are assigned to recipients",
    category: "Rewards",
  },
  {
    key: "orderDispatched",
    label: "Order shipped",
    description: "Tracking when orders go out",
    category: "Orders & delivery",
  },
  {
    key: "deliveryFailed",
    label: "Delivery issue",
    description: "Alerts for delivery problems",
    category: "Orders & delivery",
  },
  {
    key: "shopLaunched",
    label: "Shop launched",
    description: "When a new shop goes live",
    category: "Store",
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  description: string;
  category: SlackNotificationCategory;
}>;

export type SlackNotificationToggleKey =
  (typeof SLACK_NOTIFICATION_TOGGLE_OPTIONS)[number]["key"];

export type SlackNotificationToggleOption =
  (typeof SLACK_NOTIFICATION_TOGGLE_OPTIONS)[number];

export function groupSlackNotificationOptions(
  options: readonly SlackNotificationToggleOption[] = SLACK_NOTIFICATION_TOGGLE_OPTIONS,
): { category: SlackNotificationCategory; items: SlackNotificationToggleOption[] }[] {
  return SLACK_NOTIFICATION_CATEGORIES.map((category) => ({
    category,
    items: options.filter((opt) => opt.category === category),
  })).filter((group) => group.items.length > 0);
}

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
