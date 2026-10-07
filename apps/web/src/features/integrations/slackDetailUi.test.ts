import { describe, it, expect } from "vitest";
import {
  SLACK_DETAIL_LEAD,
  canSaveSlackChannel,
  canSendSlackTestMessage,
  formatSlackChannelLabel,
  groupSlackNotificationOptions,
  resolveSlackNotificationPrefs,
  SLACK_NOTIFICATIONS_DESCRIPTION,
  SLACK_NOTIFICATIONS_TITLE,
  SLACK_NOTIFICATION_TOGGLE_OPTIONS,
  slackChannelOptionLabel,
} from "./slackDetailUi";

describe("Slack detail UI polish", () => {
  it("does not include invite-bot wording in channel labels", () => {
    expect(slackChannelOptionLabel({ name: "all-shelfmerch-swag" })).toBe("#all-shelfmerch-swag");
    expect(slackChannelOptionLabel({ name: "social" })).toBe("#social");
    expect(slackChannelOptionLabel({ name: "new-channel" })).not.toMatch(/invite bot/i);
  });

  it("formats selected channel with # prefix", () => {
    expect(formatSlackChannelLabel("all-shelfmerch-swag")).toBe("#all-shelfmerch-swag");
    expect(formatSlackChannelLabel("#already")).toBe("#already");
    expect(formatSlackChannelLabel(null)).toBe("Not selected");
  });

  it("only enables save when draft differs from saved default", () => {
    expect(canSaveSlackChannel({ draftId: "", defaultChannelId: null })).toBe(false);
    expect(canSaveSlackChannel({ draftId: "C1", defaultChannelId: "C1" })).toBe(false);
    expect(canSaveSlackChannel({ draftId: "C2", defaultChannelId: "C1" })).toBe(true);
    expect(canSaveSlackChannel({ draftId: "C2", defaultChannelId: null })).toBe(true);
  });

  it("requires a default channel before test message", () => {
    expect(canSendSlackTestMessage(null)).toBe(false);
    expect(canSendSlackTestMessage("")).toBe(false);
    expect(canSendSlackTestMessage("C1")).toBe(true);
  });

  it("keeps customer-facing lead copy without developer jargon", () => {
    expect(SLACK_DETAIL_LEAD.toLowerCase()).not.toContain("oauth");
    expect(SLACK_DETAIL_LEAD.toLowerCase()).not.toContain("bot token");
    expect(SLACK_DETAIL_LEAD.toLowerCase()).not.toContain("phase");
  });
});

describe("Slack notification preferences UI helpers", () => {
  it("exposes customer-facing toggle labels without developer jargon", () => {
    const labels = SLACK_NOTIFICATION_TOGGLE_OPTIONS.map((o) => o.label).join(" ");
    expect(labels).toContain("Wallet funded");
    expect(labels).toContain("Order shipped");
    expect(labels).not.toContain("ORDER_DISPATCHED");
    expect(labels).not.toContain("Phase");
    expect(SLACK_NOTIFICATIONS_TITLE).toBe("Notifications");
    expect(SLACK_NOTIFICATIONS_DESCRIPTION).toContain("ShelfMerch activity");
  });

  it("groups notification options into preference sections", () => {
    const groups = groupSlackNotificationOptions();
    expect(groups.map((g) => g.category)).toEqual([
      "Finance",
      "Rewards",
      "Orders & delivery",
      "Store",
    ]);
    expect(groups[0].items.map((i) => i.label)).toEqual([
      "Wallet funded",
      "Budget assigned",
      "Low budget alerts",
    ]);
    expect(groups.every((g) => g.items.every((i) => i.description.length > 0))).toBe(true);
  });

  it("resolves saved notification values with legacy orderDispatched fallback", () => {
    const prefs = resolveSlackNotificationPrefs({
      notifyOrderDispatched: false,
      notifications: {
        walletApproved: true,
        budgetAssigned: false,
      },
    });
    expect(prefs.walletApproved).toBe(true);
    expect(prefs.budgetAssigned).toBe(false);
    expect(prefs.orderDispatched).toBe(false);
  });
});