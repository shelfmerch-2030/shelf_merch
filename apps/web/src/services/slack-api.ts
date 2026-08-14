/**
 * Slack workspace integration — routes at /api/integrations/slack.
 */
import { ApiError } from "./api";
import { getAccessToken } from "./auth-store";

const SLACK_API_BASE = "/api/integrations/slack";

export type SlackNotificationPreferences = {
  walletApproved: boolean;
  budgetAssigned: boolean;
  lowBudget: boolean;
  pointsDistributed: boolean;
  kitsAssigned: boolean;
  orderDispatched: boolean;
  deliveryFailed: boolean;
  shopLaunched: boolean;
};

export type SlackConnectionPublic = {
  id: string;
  teamId: string;
  teamName: string | null;
  enterpriseId: string | null;
  enterpriseName: string | null;
  botUserId: string | null;
  status: string;
  defaultChannelId: string | null;
  defaultChannelName: string | null;
  notifyOrderDispatched?: boolean;
  notifications?: SlackNotificationPreferences;
  connectedAt: string | null;
  installedByUserId: string | null;
  updatedAt: string | null;
};

export type SlackChannelPublic = {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
};

async function slackFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${SLACK_API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const err =
      body && typeof body === "object" && body !== null && "error" in body
        ? (body as { error?: { message?: string; code?: string; details?: unknown } }).error
        : undefined;
    throw new ApiError(
      res.status,
      err?.message || res.statusText || "Slack request failed",
      err?.code || "SLACK_API_ERROR",
      err?.details,
    );
  }

  return body as T;
}

export async function startSlackConnect(): Promise<string> {
  const data = await slackFetch<{ success: boolean; authorizeUrl: string }>("/connect");
  if (!data?.authorizeUrl) {
    throw new ApiError(502, "Slack authorize URL missing", "SLACK_API_ERROR");
  }
  return data.authorizeUrl;
}

export async function fetchSlackConnection(): Promise<SlackConnectionPublic | null> {
  const data = await slackFetch<{ success: boolean; connection: SlackConnectionPublic | null }>(
    "/connection",
  );
  return data.connection ?? null;
}

export async function fetchSlackChannels(): Promise<SlackChannelPublic[]> {
  const data = await slackFetch<{ success: boolean; channels: SlackChannelPublic[] }>("/channels");
  return data.channels ?? [];
}

export async function setSlackDefaultChannel(channelId: string): Promise<SlackConnectionPublic> {
  const data = await slackFetch<{ success: boolean; connection: SlackConnectionPublic }>(
    "/default-channel",
    { method: "PUT", body: JSON.stringify({ channelId }) },
  );
  return data.connection;
}

export async function sendSlackTestMessage(channelId?: string): Promise<{
  channelId: string;
  channelName: string | null;
  ts: string | null;
}> {
  const data = await slackFetch<{
    success: boolean;
    channelId: string;
    channelName: string | null;
    ts: string | null;
  }>("/test-message", {
    method: "POST",
    body: JSON.stringify(channelId ? { channelId } : {}),
  });
  return { channelId: data.channelId, channelName: data.channelName, ts: data.ts };
}

export async function disconnectSlack(): Promise<void> {
  await slackFetch<{ success: boolean }>("/disconnect", { method: "POST", body: "{}" });
}

export async function updateSlackNotifications(
  preferences: Partial<SlackNotificationPreferences>,
): Promise<SlackConnectionPublic> {
  const data = await slackFetch<{ success: boolean; connection: SlackConnectionPublic }>(
    '/notifications',
    { method: 'PUT', body: JSON.stringify(preferences) },
  );
  return data.connection;
}