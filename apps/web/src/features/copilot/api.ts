import { API_BASE } from "@/services/config";
import { apiFetch } from "@/services/api";
import { getAccessToken } from "@/services/auth-store";

export type CopilotCapability = {
  id: string;
  group: string;
  title: string;
  prompt: string;
};

export type CopilotAction = {
  id: string;
  title: string;
  description: string;
} & (
  | { availability: "available"; prompt: string }
  | { availability: "integration_pending"; explanation: string }
);

export type CopilotCategory = {
  id: string;
  title: string;
  description: string;
  heading: string;
  actions: CopilotAction[];
};

export type CopilotStatus = {
  webResearchEnabled?: boolean;
  externalProductCardsEnabled?: boolean;
  externalImageEnrichmentEnabled?: boolean;
  enabled: boolean;
  provider: "openai" | "disabled" | string;
  model: string | null;
  role: string | null;
  capabilities: CopilotCapability[];
  writeToolsEnabled: boolean;
  writeDomains?: Record<string, boolean>;
  discovery?: { categories: CopilotCategory[] };
};

export type CopilotConfirmationArtifact = {
  kind: "confirmation";
  operation: string;
  confirmationId: string;
  expiresAt?: string;
  preview?: Record<string, unknown>;
  request?: {
    name?: string;
    currencyMode?: "points" | "inr";
    [key: string]: unknown;
  };
  status?: "pending" | "cancelled" | "failed" | "completed" | "expired" | "consumed" | "unverified";
  message?: string;
  progress?: Record<string, unknown>;
  canResume?: boolean;
};

export type CopilotSuccessArtifact = {
  kind: "success";
  operation: string;
  confirmationId?: string;
  status?: "completed";
  message: string;
  title?: string;
  details?: string[];
  actions?: Array<{ label: string; href: string; external?: boolean }>;
  shop?: Record<string, unknown> & { id?: string; name?: string; status?: string; slug?: string; currencyMode?: string; storefrontUrl?: string };
  result?: Record<string, unknown> & { id?: string; name?: string; status?: string; slug?: string; currencyMode?: string; storefrontUrl?: string };
};

export type CopilotWalletBalanceArtifact = {
  kind: "wallet_balance";
  scope?: "organization" | "department";
  wallet: {
    id?: string;
    name?: string;
    currency?: string;
    status?: string;
    balance: number;
    allocatedAmount: number;
    unallocatedAmount: number;
    fundingPending?: boolean;
  };
  departments?: Array<{
    entityId?: string;
    name: string;
    allocatedAmount: number;
    spentAmount?: number;
    remainingAmount: number;
    walletId?: string;
    walletName?: string;
  }>;
  reconciliation?: {
    ok?: boolean;
    warning?: string | null;
    note?: string;
    remainingDelta?: number;
    grossDelta?: number;
  };
};

export type CopilotDepartmentBudgetsArtifact = {
  kind: "department_budgets";
  scope?: "department";
  departments: Array<{
    entityId?: string;
    name: string;
    allocatedAmount: number;
    spentAmount?: number;
    remainingAmount: number;
    walletId?: string;
    walletName?: string;
  }>;
};

export type CopilotWebResearch = {
  brief: { topic: string | null; purpose: "listings" | "trends" | "comparison" | "research"; region?: string };
  status: "completed" | "partial" | "unavailable" | "no_sources" | "unverified" | "synthesis_failed" | "limited" | "disabled" | "unsupported_topic";
  checkedAt?: string;
  summarized?: boolean;
  leadsOnly?: boolean;
  sources: Array<{ title: string; url: string; excerpt: string }>;
};

export type CopilotExternalProduct = {
  verification: "verified_listing";
  name: string;
  productUrl: string;
  sourceUrl: string;
  sourceTitle: string;
  merchantHostname: string;
  merchantDisplayName?: string;
  priceText?: string;
  priceNumeric?: number;
  currency?: string;
  availability: "unknown";
  imageUrl?: string;
  imageProvenance?: "merchant_og" | "merchant_meta";
  retrievedAt: string;
  reason?: string;
};

export type CopilotGiftKitComponent =
  | {
      role: "verified_listing";
      name: string;
      externalProductIndex: number;
      priceText?: string;
      priceNumeric?: number;
      currency?: string;
      imageUrl?: string;
      productUrl?: string;
    }
  | { role: "concept"; name: string; reason: string };

export type CopilotGiftKitIdea = {
  name: string;
  rationale: string;
  packagingSuggestion: string;
  recipientFit: string;
  components: CopilotGiftKitComponent[];
  budget: {
    status: "complete" | "partial" | "unavailable";
    currency?: string;
    knownSubtotal?: number;
    missingPriceCount: number;
    note: string;
  };
  imagePolicy: "none";
};

export type CopilotArtifact =
  | { kind: "web_research"; research: CopilotWebResearch }
  | { kind: 'swag_step'; swag: { conversationId?: string; revision: number; step: import('./swagApi').SwagStep; mode?: string; selectedProducts?: Array<{ id: string; name: string; imageUrl: string }> } }
  | { kind: "catalog_page"; catalog: { query: import("./swagApi").SwagCatalogQuery; pagination: import("./swagApi").SwagCatalogPage["pagination"]; complete?: boolean } }
  | { kind: "curation"; curation: import("./curatorTypes").Curation }
  | { kind: "product"; product: Record<string, unknown> }
  | { kind: "kit"; kit: Record<string, unknown> }
  | { kind: "external_product"; product: CopilotExternalProduct }
  | { kind: "gift_kit_idea"; kit: CopilotGiftKitIdea }
  | CopilotConfirmationArtifact
  | CopilotSuccessArtifact
  | CopilotWalletBalanceArtifact
  | CopilotDepartmentBudgetsArtifact;

export type CopilotMessageAttachment = {
  id: string;
  kind: "purchase_order" | "artwork" | "banner" | "file" | "swag_artwork";
  ticketId?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type CopilotMessage = {
  uiEventId?: string;
  role: "user" | "assistant";
  content: string;
  artifacts?: CopilotArtifact[];
  attachments?: CopilotMessageAttachment[];
  createdAt?: string;
};

export async function fetchSentSwagArtwork(conversationId: string, attachmentId: string, signal: AbortSignal) {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}/copilot/conversations/${encodeURIComponent(conversationId)}/artwork/${encodeURIComponent(attachmentId)}`, {
    signal, credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok || !/^image\/png(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Logo preview unavailable');
  return response.blob();
}

export type CopilotUploadedAttachment = {
  id: string;
  kind: "purchase_order" | "artwork" | "banner" | "file" | "swag_artwork";
  status: string;
  ticketId?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  conversationId: string | null;
  expiresAt: string;
  previewHint?: string;
};

export type CopilotConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
};

export async function fetchCopilotStatus(): Promise<CopilotStatus> {
  return apiFetch<CopilotStatus>("/copilot/status");
}

export async function createCopilotConversation(title?: string) {
  return apiFetch<{ id: string; title: string }>("/copilot/conversations", {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
}

export async function listCopilotConversations() {
  return apiFetch<{ items: CopilotConversationSummary[] }>("/copilot/conversations");
}

export async function getCopilotConversation(id: string) {
  return apiFetch<{ id: string; title: string; messages: CopilotMessage[]; curator?: { enabled: boolean } | null }>(
    `/copilot/conversations/${id}`,
  );
}

export async function deleteCopilotConversation(id: string) {
  return apiFetch<{ ok: boolean }>(`/copilot/conversations/${id}`, { method: "DELETE" });
}

export type StreamHandlers = {
  onDelta?: (text: string, replace?: boolean) => void;
  onArtifacts?: (artifacts: CopilotArtifact[]) => void;
  onTool?: (name: string, status: string) => void;
  onDone?: (payload: { conversationId: string; title: string }) => void;
  onError?: (payload: { message: string; code?: string }) => void;
};

export type CopilotStoreCreatePrepareResult = {
  confirmationId: string;
  expiresAt: string;
  preview: Record<string, unknown>;
  request: { name: string; currencyMode?: "points" | "inr"; [key: string]: unknown };
};

export async function prepareCopilotStoreCreateApi(input: {
  name: string;
  currencyMode?: "points" | "inr";
}) {
  return apiFetch<CopilotStoreCreatePrepareResult>("/copilot/writes/shops/create/prepare", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function executeCopilotStoreCreateApi(input: Record<string, unknown>) {
  return apiFetch<Record<string, unknown> & { id: string; name: string; status: string }>(
    "/copilot/writes/shops/create/execute",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function cancelCopilotStoreCreateApi(confirmationId: string) {
  return apiFetch<{ status: string; confirmationId: string }>("/copilot/writes/shops/create/cancel", {
    method: "POST",
    body: JSON.stringify({ confirmationId }),
  });
}

export async function uploadCopilotAttachmentApi(
  kind: "purchase_order" | "artwork" | "banner" | "file" | "swag_artwork",
  file: File,
  conversationId?: string | null,
): Promise<CopilotUploadedAttachment> {
  const form = new FormData();
  form.append("file", file);
  const params = new URLSearchParams({ kind });
  if (conversationId) params.set("conversationId", conversationId);
  return apiFetch<CopilotUploadedAttachment>(`/copilot/attachments?${params}`, {
    method: "POST",
    body: form,
  });
}

export async function removeCopilotAttachmentApi(id: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/copilot/attachments/${id}`, {
    method: "DELETE",
  });
}

/** SSE stream for a user message. Uses fetch so Authorization header is sent. */
export async function streamCopilotMessage(
  conversationId: string,
  content: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
  attachmentIds: string[] = [],
  mode?: "chat" | "curator",
) {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/copilot/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ content, attachmentIds, ...(mode ? { mode } : {}) }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = "Copilot request failed";
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body?.error?.message || message;
      code = body?.error?.code;
    } catch {
      /* ignore */
    }
    handlers.onError?.({ message, code });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((row) => row.startsWith("data: "));
      if (!line) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const event = JSON.parse(data) as {
          type: string;
          text?: string;
          replace?: boolean;
          artifacts?: CopilotArtifact[];
          name?: string;
          status?: string;
          conversationId?: string;
          title?: string;
          message?: string;
          code?: string;
        };
        if (event.type === "delta" && typeof event.text === "string") handlers.onDelta?.(event.text, event.replace);
        if (event.type === "artifacts" && event.artifacts) handlers.onArtifacts?.(event.artifacts);
        if (event.type === "tool" && event.name) handlers.onTool?.(event.name, event.status || "");
        if (event.type === "done") {
          handlers.onDone?.({
            conversationId: event.conversationId || conversationId,
            title: event.title || "Conversation",
          });
        }
        if (event.type === "error") {
          handlers.onError?.({ message: event.message || "Copilot error", code: event.code });
        }
      } catch {
        /* ignore malformed */
      }
    }
  }
}

export async function prepareCopilotWriteApi(workflow: string, input: Record<string, unknown>) {
  return apiFetch<CopilotStoreCreatePrepareResult & { workflow?: string; operation?: string }>(`/copilot/writes/${encodeURIComponent(workflow)}/prepare`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function executeCopilotWriteApi(workflow: string, input: Record<string, unknown>) {
  return apiFetch<Record<string, unknown> & { id?: string; name?: string; status?: string }>(`/copilot/writes/${encodeURIComponent(workflow)}/execute`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cancelCopilotWriteApi(workflow: string, confirmationId: string) {
  return apiFetch<{ status: string; confirmationId: string; workflow?: string }>(`/copilot/writes/${encodeURIComponent(workflow)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ confirmationId }),
  });
}

export async function resolveCopilotWriteApi(workflow: string, input: Record<string, unknown>) {
  return apiFetch<{
    status: "pending" | "cancelled" | "completed" | "consumed" | "expired" | "failed";
    confirmationId: string;
    workflow?: string;
    expiresAt?: string;
    progress?: Record<string, unknown>;
    canResume?: boolean;
    result?: Record<string, unknown> & { id?: string; name?: string; status?: string };
  }>(`/copilot/writes/${encodeURIComponent(workflow)}/resolve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function persistCopilotWriteArtifactApi(
  conversationId: string,
  input: { confirmationId: string; artifact: CopilotConfirmationArtifact | CopilotSuccessArtifact | Record<string, unknown> },
) {
  return apiFetch<{ ok: boolean; conversationId: string; confirmationId: string }>(
    `/copilot/conversations/${encodeURIComponent(conversationId)}/write-artifacts`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}
