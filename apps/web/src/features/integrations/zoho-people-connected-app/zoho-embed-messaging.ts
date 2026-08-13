/**
 * Cross-window messaging for the Zoho People Connected App embed.
 */

export const SHELFMERCH_ZOHO_EMBED_AUTH = "SHELFMERCH_ZOHO_EMBED_AUTH";
export const SHELFMERCH_ZOHO_EMBED_AUTH_ACK = "SHELFMERCH_ZOHO_EMBED_AUTH_ACK";
/** @deprecated Use SHELFMERCH_ZOHO_OAUTH_DONE */
export const SHELFMERCH_ZOHO_EMBED_OAUTH = "SHELFMERCH_ZOHO_EMBED_OAUTH";
export const SHELFMERCH_ZOHO_OAUTH_BRIDGE_READY = "SHELFMERCH_ZOHO_OAUTH_BRIDGE_READY";
export const SHELFMERCH_ZOHO_OAUTH_LAUNCH = "SHELFMERCH_ZOHO_OAUTH_LAUNCH";
export const SHELFMERCH_ZOHO_OAUTH_DONE = "SHELFMERCH_ZOHO_OAUTH_DONE";
export const SHELFMERCH_ZOHO_OAUTH_DONE_ACK = "SHELFMERCH_ZOHO_OAUTH_DONE_ACK";

export const EMBED_OPENER_MISSING = "EMBED_OPENER_MISSING";

/** Target origin for postMessage — production shelfmerch.io, else current origin. */
export function shelfmerchPostMessageOrigin(): string {
  if (typeof window === "undefined") return "https://shelfmerch.io";
  if (window.location.hostname === "shelfmerch.io") return "https://shelfmerch.io";
  return window.location.origin;
}

export type ZohoEmbedAuthMessage = {
  type: typeof SHELFMERCH_ZOHO_EMBED_AUTH;
  code: string;
  requestId: string;
};

export type ZohoEmbedAuthAckMessage = {
  type: typeof SHELFMERCH_ZOHO_EMBED_AUTH_ACK;
  requestId: string;
};

export type ZohoEmbedOAuthMessage = {
  type: typeof SHELFMERCH_ZOHO_EMBED_OAUTH;
  status: "connected" | "error";
  reason?: string;
};

export type ZohoOAuthBridgeReadyMessage = {
  type: typeof SHELFMERCH_ZOHO_OAUTH_BRIDGE_READY;
  requestId: string;
};

export type ZohoOAuthLaunchMessage = {
  type: typeof SHELFMERCH_ZOHO_OAUTH_LAUNCH;
  code: string;
  requestId: string;
};

export type ZohoOAuthDoneMessage = {
  type: typeof SHELFMERCH_ZOHO_OAUTH_DONE;
  status: "connected" | "error";
  requestId: string;
  reason?: string;
};

export type ZohoOAuthDoneAckMessage = {
  type: typeof SHELFMERCH_ZOHO_OAUTH_DONE_ACK;
  requestId: string;
};

export function isZohoEmbedAuthMessage(value: unknown): value is ZohoEmbedAuthMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as ZohoEmbedAuthMessage;
  return (
    msg.type === SHELFMERCH_ZOHO_EMBED_AUTH &&
    typeof msg.code === "string" &&
    typeof msg.requestId === "string"
  );
}

export function isZohoEmbedAuthAckMessage(value: unknown): value is ZohoEmbedAuthAckMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as ZohoEmbedAuthAckMessage;
  return msg.type === SHELFMERCH_ZOHO_EMBED_AUTH_ACK && typeof msg.requestId === "string";
}

export function isZohoEmbedOAuthMessage(value: unknown): value is ZohoEmbedOAuthMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as ZohoEmbedOAuthMessage;
  return (
    msg.type === SHELFMERCH_ZOHO_EMBED_OAUTH &&
    (msg.status === "connected" || msg.status === "error")
  );
}

export function isZohoOAuthBridgeReadyMessage(
  value: unknown,
): value is ZohoOAuthBridgeReadyMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as ZohoOAuthBridgeReadyMessage;
  return msg.type === SHELFMERCH_ZOHO_OAUTH_BRIDGE_READY && typeof msg.requestId === "string";
}

export function isZohoOAuthLaunchMessage(value: unknown): value is ZohoOAuthLaunchMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as ZohoOAuthLaunchMessage;
  return (
    msg.type === SHELFMERCH_ZOHO_OAUTH_LAUNCH &&
    typeof msg.code === "string" &&
    typeof msg.requestId === "string"
  );
}

export function isZohoOAuthDoneMessage(value: unknown): value is ZohoOAuthDoneMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as ZohoOAuthDoneMessage;
  return (
    msg.type === SHELFMERCH_ZOHO_OAUTH_DONE &&
    (msg.status === "connected" || msg.status === "error") &&
    typeof msg.requestId === "string"
  );
}

export function isZohoOAuthDoneAckMessage(value: unknown): value is ZohoOAuthDoneAckMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as ZohoOAuthDoneAckMessage;
  return msg.type === SHELFMERCH_ZOHO_OAUTH_DONE_ACK && typeof msg.requestId === "string";
}

export function createEmbedRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type EmbedAuthPostMessageOptions = {
  opener: Window;
  code: string;
  requestId: string;
  targetOrigin?: string;
  timeoutMs?: number;
  intervalMs?: number;
};

/**
 * Send embed auth code to opener and wait for ACK (retries until timeout).
 * Never logs or exposes the code outside postMessage.
 */
export function sendEmbedAuthAndAwaitAck({
  opener,
  code,
  requestId,
  targetOrigin = shelfmerchPostMessageOrigin(),
  timeoutMs = 5000,
  intervalMs = 300,
}: EmbedAuthPostMessageOptions): Promise<void> {
  const message: ZohoEmbedAuthMessage = {
    type: SHELFMERCH_ZOHO_EMBED_AUTH,
    code,
    requestId,
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const started = Date.now();

    const onAck = (event: MessageEvent) => {
      if (settled) return;
      if (event.origin !== targetOrigin) return;
      if (!isZohoEmbedAuthAckMessage(event.data)) return;
      if (event.data.requestId !== requestId) return;
      settled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("message", onAck);
      resolve();
    };

    window.addEventListener("message", onAck);

    const send = () => {
      if (settled) return;
      if (opener.closed) {
        settled = true;
        window.clearInterval(intervalId);
        window.removeEventListener("message", onAck);
        reject(new Error("OPENER_CLOSED"));
        return;
      }
      opener.postMessage(message, targetOrigin);
    };

    const intervalId = window.setInterval(() => {
      if (settled) return;
      if (Date.now() - started >= timeoutMs) {
        settled = true;
        window.clearInterval(intervalId);
        window.removeEventListener("message", onAck);
        reject(new Error("ACK_TIMEOUT"));
        return;
      }
      send();
    }, intervalMs);

    send();
  });
}

export function buildEmbedAuthAck(requestId: string): ZohoEmbedAuthAckMessage {
  return { type: SHELFMERCH_ZOHO_EMBED_AUTH_ACK, requestId };
}

export function buildOAuthDoneAck(requestId: string): ZohoOAuthDoneAckMessage {
  return { type: SHELFMERCH_ZOHO_OAUTH_DONE_ACK, requestId };
}

export type OAuthDonePostMessageOptions = {
  opener: Window;
  status: "connected" | "error";
  requestId: string;
  reason?: string;
  targetOrigin?: string;
  timeoutMs?: number;
  intervalMs?: number;
};

/** Notify opener of OAuth completion and wait for ACK before resolving. */
export function sendOAuthDoneAndAwaitAck({
  opener,
  status,
  requestId,
  reason,
  targetOrigin = shelfmerchPostMessageOrigin(),
  timeoutMs = 5000,
  intervalMs = 300,
}: OAuthDonePostMessageOptions): Promise<void> {
  const message: ZohoOAuthDoneMessage = {
    type: SHELFMERCH_ZOHO_OAUTH_DONE,
    status,
    requestId,
    ...(reason ? { reason } : {}),
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const started = Date.now();

    const onAck = (event: MessageEvent) => {
      if (settled) return;
      if (event.origin !== targetOrigin) return;
      if (!isZohoOAuthDoneAckMessage(event.data)) return;
      if (event.data.requestId !== requestId) return;
      settled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("message", onAck);
      resolve();
    };

    window.addEventListener("message", onAck);

    const send = () => {
      if (settled) return;
      if (opener.closed) {
        settled = true;
        window.clearInterval(intervalId);
        window.removeEventListener("message", onAck);
        reject(new Error("OPENER_CLOSED"));
        return;
      }
      opener.postMessage(message, targetOrigin);
    };

    const intervalId = window.setInterval(() => {
      if (settled) return;
      if (Date.now() - started >= timeoutMs) {
        settled = true;
        window.clearInterval(intervalId);
        window.removeEventListener("message", onAck);
        reject(new Error("ACK_TIMEOUT"));
        return;
      }
      send();
    }, intervalMs);

    send();
  });
}

export type EmbedAuthDedupState = {
  inFlightRequestIds: Set<string>;
  completedRequestIds: Set<string>;
};

export function createEmbedAuthDedupState(): EmbedAuthDedupState {
  return {
    inFlightRequestIds: new Set<string>(),
    completedRequestIds: new Set<string>(),
  };
}

export type HandleEmbedAuthMessageResult =
  | "ignored_in_flight"
  | "ack_only"
  | "exchanged"
  | "failed";

/**
 * Deduplicate embed auth postMessages by requestId before calling /embed/exchange.
 */
export async function handleEmbedAuthMessage(
  state: EmbedAuthDedupState,
  message: { code: string; requestId: string },
  deps: {
    exchange: (code: string, requestId: string) => Promise<unknown>;
    sendAck: (requestId: string) => void;
    onExchangeStart?: () => void;
    onExchangeSuccess: () => void | Promise<void>;
    onExchangeFailure: (error: unknown) => void;
  },
): Promise<HandleEmbedAuthMessageResult> {
  const { requestId, code } = message;

  if (state.completedRequestIds.has(requestId)) {
    deps.sendAck(requestId);
    return "ack_only";
  }

  if (state.inFlightRequestIds.has(requestId)) {
    return "ignored_in_flight";
  }

  state.inFlightRequestIds.add(requestId);
  deps.onExchangeStart?.();

  try {
    await deps.exchange(code, requestId);
  } catch (error) {
    state.inFlightRequestIds.delete(requestId);
    if (state.completedRequestIds.has(requestId)) {
      deps.sendAck(requestId);
      return "ack_only";
    }
    deps.onExchangeFailure(error);
    return "failed";
  }

  state.inFlightRequestIds.delete(requestId);
  state.completedRequestIds.add(requestId);
  deps.sendAck(requestId);
  await deps.onExchangeSuccess();
  return "exchanged";
}
