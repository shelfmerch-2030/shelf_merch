import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ArrowDown,
  ArrowLeft,
  CircleAlert,
  LoaderCircle,
  PanelLeftOpen,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { tenantPath } from "@/lib/workspaceSlug";
import {
  createCopilotConversation,
  deleteCopilotConversation,
  getCopilotConversation,
  listCopilotConversations,
  removeCopilotAttachmentApi,
  streamCopilotMessage,
  uploadCopilotAttachmentApi,
  cancelCopilotWriteApi,
  type CopilotConversationSummary,
  type CopilotMessage,
} from "./api";
import {
  revokeAttachmentPreview,
  type CopilotAttachmentDraft,
} from "./attachments";
import { CopilotArtifacts } from "./CopilotProductCards";
import { CopilotMarkdown } from "./CopilotMarkdown";
import { CopilotUserMessage } from "./CopilotUserMessage";
import { CopilotIcon } from "./CopilotIcon";
import { CopilotWelcome } from "./CopilotWelcome";
import { CopilotComposer } from "./CopilotComposer";
import { useSwagConversation } from "./useSwagConversation";
import { SwagWorkflowPanel } from "./SwagWorkflowPanel";
import type { SwagPatch, SwagStep } from "./swagApi";
import { CopilotHistory } from "./CopilotHistory";
import { CopilotStoreCreateForm } from "./CopilotStoreCreateConfirm";
import { useCopilotStatus } from "./useCopilotStatus";
import type { CopilotArtifact, CopilotAction } from "./api";
import "./copilot.css";

type UiMessage = CopilotMessage & { streaming?: boolean; toolStatus?: string };
type UiError = { message: string; prompt?: string };
type StreamingConversation = { messages: UiMessage[]; controller: AbortController };

export function CopilotPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    data: status,
    isLoading: statusLoading,
    error: statusError,
    refetch,
  } = useCopilotStatus();
  const [conversations, setConversations] = useState<CopilotConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<CopilotAttachmentDraft[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [storeCreateOpen, setStoreCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamsRef = useRef(new Map<string | number, StreamingConversation>());
  const viewKeyRef = useRef<string | number>(0);
  const newViewKeyRef = useRef(0);
  const historyLoadedRef = useRef(false);
  const historyRequestRef = useRef(false);
  const lockRef = useRef(false);
  const mounted = useRef(true);
  const nearBottom = useRef(true);
  const swag = useSwagConversation(activeId, status?.role === 'company_admin' && status?.writeDomains?.collections === true);
  const locked = busy || opening || deleting || swag.busy;
  const pendingSwag = messages.flatMap(message => message.artifacts || []).filter(artifact => artifact.kind === 'confirmation' && artifact.operation === 'swag.collection' && artifact.status === 'pending');
  const activeSwag = swag.state?.active ? swag.state : null;
  const artworkReviews = messages.flatMap(message => message.artifacts || []).filter(artifact => artifact.kind === 'confirmation'
    && artifact.operation === 'swag.collection' && artifact.request?.action === 'apply' && artifact.request?.revision === activeSwag?.revision);
  const artworkReviewState = artworkReviews.some(artifact => artifact.kind === 'confirmation' && ['consumed', 'unverified'].includes(artifact.status || '')) ? 'unverified'
    : artworkReviews.some(artifact => artifact.kind === 'confirmation' && ['cancelled', 'expired', 'failed'].includes(artifact.status || '')) ? 'dismissed' : undefined;
  const uploadedSwagArtwork = attachments.find(row => row.kind === 'swag_artwork' && row.status === 'uploaded' && row.serverId);
  const swagControls = activeSwag ? { selectedIds: activeSwag.productIds, busy: locked || pendingSwag.length > 0 || artworkReviewState === 'unverified',
    onToggle: (id: string) => void swag.change(activeSwag.productIds.includes(id) ? { removeProductIds: [id] } : { addProductIds: [id] }) } : undefined;
  const providerDisabled = status?.provider === "disabled";
  const activeTitle = conversations.find((row) => row.id === activeId)?.title;
  const showWelcome = !messages.length && !busy && !opening;

  function closeCopilot() {
    const destination: unknown = location.state?.copilotReturnTo;
    const base = tenantPath();
    const isWorkspacePage =
      typeof destination === "string" &&
      (destination === base ||
        destination.startsWith(`${base}/`) ||
        destination.startsWith(`${base}?`)) &&
      !destination.split(/[?#]/)[0].endsWith("/copilot");
    navigate(isWorkspacePage ? destination : base, { replace: true });
  }

  const loadHistory = useCallback(async () => {
    if (historyRequestRef.current) return;
    historyRequestRef.current = true;
    if (!historyLoadedRef.current) setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await listCopilotConversations();
      if (mounted.current) {
        historyLoadedRef.current = true;
        setConversations((previous) => {
          // A chat may be created or renamed while the initial request is in flight.
          const fetched = new Map(res.items.map((row) => [row.id, row]));
          const merged = previous.map((row) => {
            const incoming = fetched.get(row.id);
            fetched.delete(row.id);
            return incoming && incoming.updatedAt > row.updatedAt ? incoming : row;
          });
          return [...merged, ...fetched.values()];
        });
      }
    } catch {
      if (mounted.current) setHistoryError("Couldn’t load your conversations.");
    } finally {
      historyRequestRef.current = false;
      if (mounted.current) setHistoryLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      streamsRef.current.forEach((stream) => stream.controller.abort());
      setAttachments((prev) => {
        prev.forEach(revokeAttachmentPreview);
        return [];
      });
    };
  }, []);

  function clearAttachments() {
    setAttachments((prev) => {
      prev.forEach(revokeAttachmentPreview);
      return [];
    });
  }

  function patchAttachment(localId: string, patch: Partial<CopilotAttachmentDraft>) {
    setAttachments((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    );
  }

  async function uploadAttachmentRow(row: CopilotAttachmentDraft) {
    patchAttachment(row.localId, { status: "uploading", error: undefined });
    try {
      const uploaded = await uploadCopilotAttachmentApi(row.kind, row.file, activeId);
      if (!mounted.current) return;
      patchAttachment(row.localId, {
        status: "uploaded",
        serverId: uploaded.id,
        ticketId: uploaded.ticketId,
        originalName: uploaded.originalName || row.originalName,
        mimeType: uploaded.mimeType || row.mimeType,
        sizeBytes: uploaded.sizeBytes || row.sizeBytes,
      });
      if (row.kind === 'swag_artwork' && activeSwag && viewKeyRef.current === activeId) await swag.change({ artworkAttachmentId: uploaded.id });
    } catch (err) {
      if (!mounted.current) return;
      patchAttachment(row.localId, {
        status: "failed",
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  async function removeAttachmentRow(localId: string) {
    const row = attachments.find((item) => item.localId === localId);
    if (!row) return;
    revokeAttachmentPreview(row);
    setAttachments((prev) => prev.filter((item) => item.localId !== localId));
    if (row.serverId) {
      try {
        await removeCopilotAttachmentApi(row.serverId);
      } catch {
        /* best-effort server cleanup */
      }
    }
  }

  function retryAttachmentRow(localId: string) {
    const row = attachments.find((item) => item.localId === localId);
    if (!row) return;
    void uploadAttachmentRow(row);
  }
  useEffect(() => {
    if (status?.enabled) void loadHistory();
  }, [status?.enabled, loadHistory]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (showWelcome) el.scrollTop = 0;
    else if (nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, busy, opening, showWelcome, selectedCategoryId]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (showWelcome) el.scrollTop = 0;
      else if (nearBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [status?.enabled, showWelcome]);

  function startNew() {
    if (lockRef.current) return;
    viewKeyRef.current = ++newViewKeyRef.current;
    setBusy(false);
    setError(null);
    setActiveId(null);
    setMessages([]);
    setDraft("");
    clearAttachments();
    setSelectedCategoryId(null);
    setStoreCreateOpen(false);
    setDrawerOpen(false);
    nearBottom.current = true;
    setScrolledUp(false);
  }

  function patchMessageArtifact(messageIndex: number, artifactIndex: number, next: CopilotArtifact) {
    if ((next.kind === 'success' || next.kind === 'confirmation') && next.operation === 'swag.collection') {
      nearBottom.current = true; void swag.refresh();
    }
    setMessages((prev) => {
      const updated = prev.map((message, index) => {
        if (index !== messageIndex) return message;
        const artifacts = [...(message.artifacts || [])];
        artifacts[artifactIndex] = next;
        return { ...message, artifacts };
      });
      const stream = streamsRef.current.get(viewKeyRef.current);
      if (stream) stream.messages = updated;
      return updated;
    });
  }

  async function reloadSwagMessages(id: string) {
    const detail = await getCopilotConversation(id);
    if (viewKeyRef.current === id) setMessages(detail.messages);
  }
  async function prepareSwag(action: 'save' | 'publish' | 'apply', expectedRevision?: number) {
    const id = activeId;
    if (!id || viewKeyRef.current !== id || pendingSwag.length) return;
    await swag.prepare(action, expectedRevision);
    nearBottom.current = true;
    // Includes recovery of a server-persisted preview if the HTTP acknowledgement was lost.
    try { await reloadSwagMessages(id); } catch (err) { if (viewKeyRef.current === id) setError({ message: err instanceof Error ? err.message : 'Could not reload confirmation. Check conversation status before preparing again.' }); }
  }
  async function editSwag(step: SwagStep) {
    if (viewKeyRef.current !== activeId) return;
    try {
      for (const artifact of pendingSwag) if (artifact.kind === 'confirmation') await cancelCopilotWriteApi('swag.collection', artifact.confirmationId);
      await swag.change({ step });
      if (activeId && pendingSwag.length) await reloadSwagMessages(activeId);
    } catch (err) { setError({ message: err instanceof Error ? err.message : 'Could not dismiss the old confirmation. Check its status before editing.' }); }
  }
  async function changeSwag(patch: SwagPatch) {
    const result = await swag.change(patch);
    if (result && patch.artwork === 'none') {
      for (const row of attachments.filter(row => row.kind === 'swag_artwork')) await removeAttachmentRow(row.localId);
    }
    return result;
  }

  function handleDiscoveryAction(action: CopilotAction) {
    if (action.id === "stores_create" && status?.writeToolsEnabled) {
      viewKeyRef.current = ++newViewKeyRef.current;
      setBusy(false);
      setStoreCreateOpen(true);
      setMessages([]);
      setActiveId(null);
      return;
    }
    if (action.availability === "available" && "prompt" in action) {
      setStoreCreateOpen(false);
      setDraft(action.prompt);
      document.getElementById("copilot-input")?.focus();
    }
  }
  async function openConversation(id: string) {
    if (lockRef.current) return;
    lockRef.current = true;
    setOpening(true);
    setError(null);
    setDrawerOpen(false);
    try {
      const streaming = streamsRef.current.get(id);
      const detail = streaming ? { messages: streaming.messages } : await getCopilotConversation(id);
      if (!mounted.current) return;
      nearBottom.current = true;
      setScrolledUp(false);
      setActiveId(id);
      viewKeyRef.current = id;
      setBusy(streamsRef.current.has(id));
      setSelectedCategoryId(null);
      setMessages(
        detail.messages.filter(
          (message) => Boolean(streaming) || message.role === "user" || message.content || message.artifacts?.length,
        ),
      );
      setDraft("");
      clearAttachments();
    } catch (err) {
      if (mounted.current)
        setError({
          message:
            err instanceof Error
              ? err.message
              : "Couldn’t open this conversation. Please select it again.",
        });
    } finally {
      lockRef.current = false;
      if (mounted.current) setOpening(false);
    }
  }
  async function removeConversation() {
    if (!activeId || lockRef.current) return;
    lockRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      await deleteCopilotConversation(activeId);
      if (!mounted.current) return;
      setConversations((prev) => prev.filter((row) => row.id !== activeId));
      setActiveId(null);
      viewKeyRef.current = ++newViewKeyRef.current;
      setSelectedCategoryId(null);
      setMessages([]);
      setDraft("");
      clearAttachments();
    } catch (err) {
      if (mounted.current)
        setError({
          message:
            err instanceof Error
              ? err.message
              : "Couldn’t delete this conversation. Please try again.",
        });
    } finally {
      lockRef.current = false;
      if (mounted.current) {
        setDeleting(false);
        setDeleteOpen(false);
      }
    }
  }
  async function sendPrompt(raw: string) {
    const content = raw.trim();
    const readyAttachments = attachments.filter(
      (row) => row.status === "uploaded" && row.serverId,
    );
    const attachmentIds = readyAttachments.map((row) => row.serverId!).filter(Boolean);
    if (
      (!content && !attachmentIds.length) ||
      lockRef.current ||
      swag.busy ||
      streamsRef.current.has(viewKeyRef.current) ||
      !status?.enabled ||
      providerDisabled ||
      attachments.some((row) => row.status === "uploading" || row.status === "selected" || row.status === "failed")
    ) {
      return;
    }
    let streamKey = viewKeyRef.current;
    const stream: StreamingConversation = { messages: [], controller: new AbortController() };
    streamsRef.current.set(streamKey, stream);
    const isCurrent = () => mounted.current && viewKeyRef.current === streamKey;
    setBusy(true);
    setError(null);
    setDraft("");
    const pendingAttachments = readyAttachments.map((row) => ({
      id: row.serverId!,
      kind: row.kind,
      ticketId: row.ticketId,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    }));
    clearAttachments();
    nearBottom.current = true;
    setScrolledUp(false);
    stream.messages = [
      ...messages,
      {
        role: "user",
        content: content || `Attached ${pendingAttachments.length} file(s)`,
        attachments: pendingAttachments,
      },
      { role: "assistant", content: "", streaming: true },
    ];
    setMessages(stream.messages);
    const updateAssistant = (update: (message: UiMessage) => UiMessage) => {
      if (!mounted.current) return;
      stream.messages = stream.messages.map((message, index) =>
        index === stream.messages.length - 1 && message.role === "assistant" ? update(message) : message,
      );
      if (isCurrent()) setMessages(stream.messages);
    };
    let failed = false;
    let completed = false;
    try {
      let id = activeId;
      if (!id) {
        const created = await createCopilotConversation();
        if (!mounted.current) return;
        id = created.id;
        streamsRef.current.delete(streamKey);
        if (isCurrent()) {
          viewKeyRef.current = id;
          setActiveId(id);
        }
        streamKey = id;
        streamsRef.current.set(streamKey, stream);
        const now = new Date().toISOString();
        setConversations((prev) => [{ ...created, createdAt: now, updatedAt: now }, ...prev.filter((row) => row.id !== id)]);
      }
      if (!mounted.current) return;
      await streamCopilotMessage(
        id,
        content,
        {
          onDelta: (text) =>
            updateAssistant((message) => ({ ...message, content: message.content + text })),
          onArtifacts: (rows) =>
            updateAssistant((message) => ({
              ...message,
              artifacts: [...(message.artifacts || []), ...rows],
            })),
          onTool: (_name, toolStatus) => updateAssistant((message) => ({ ...message, toolStatus })),
          onDone: ({ title }) => {
            void swag.refresh(id);
            completed = true;
            if (!mounted.current) return;
            setConversations((prev) => prev.map((row) => row.id === id
              ? { ...row, title, updatedAt: new Date().toISOString() }
              : row));
          },
          onError: ({ message, code }) => {
            failed = true;
            if (!isCurrent()) return;
            let nextMessage = message;
            if (code === "COPILOT_USER_QUOTA" || code === "COPILOT_TENANT_QUOTA") {
              nextMessage = message.includes("ShelfMerch Copilot daily token limit")
                ? message
                : `ShelfMerch Copilot daily token quota reached (not an Anthropic/OpenAI rate limit). ${message}`;
            } else if (code === "PROVIDER_RATE_LIMIT") {
              nextMessage = message.includes("provider-side throttle")
                ? message
                : `AI provider rate limit (not ShelfMerch daily quota). ${message}`;
            }
            setError({ message: nextMessage, prompt: content });
          },
        },
        stream.controller.signal,
        attachmentIds,
        "chat",
      );
      if (!completed && !failed) throw new Error("The reply was interrupted. Please try again.");
    } catch (err) {
      failed = true;
      if (isCurrent())
        setError({
          message:
            err instanceof Error ? err.message : "We couldn’t send your message. Please try again.",
          prompt: content,
        });
    } finally {
      streamsRef.current.delete(streamKey);
      if (mounted.current) {
        stream.messages = stream.messages.flatMap((message, index) => {
            if (index !== stream.messages.length - 1 || message.role !== "assistant") return [message];
            if (failed && !message.content && !message.artifacts?.length) return [];
            return [{ ...message, streaming: false, toolStatus: undefined }];
          });
        if (isCurrent()) {
          setMessages(stream.messages);
          setBusy(false);
          if (activeSwag && typeof streamKey === 'string') {
            try { await reloadSwagMessages(streamKey); } catch { /* A later reload can recover the authoritative message history. */ }
          }
        }
      }
    }
  }

  const historyProps = {
    conversations,
    activeId,
    loading: historyLoading,
    error: historyError,
    locked: opening || deleting,
    onSelect: (id: string) => void openConversation(id),
    onNew: startNew,
    onReload: () => void loadHistory(),
  };
  if (statusLoading || !status?.enabled) {
    return (
      <section className="sm-copilot-unavailable">
        <CopilotIcon size={36} />
        <h1>ShelfMerch Copilot</h1>
        <p role="status">
          {statusLoading
            ? "Getting your workspace ready…"
            : statusError
              ? "We couldn’t connect to Copilot. Please try again."
              : "Copilot isn’t available for this workspace yet."}
        </p>
        <div>
          {statusError ? (
            <button type="button" className="sm-copilot-new" onClick={() => void refetch()}>
              <RotateCcw size={16} aria-hidden="true" />
              Try again
            </button>
          ) : null}
          <button
            type="button"
            className="sm-copilot-text-button"
            onClick={() => navigate(tenantPath())}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to dashboard
          </button>
        </div>
      </section>
    );
  }
  return (
    <div
      className={`sm-copilot-page${collapsed ? " sm-copilot-page--collapsed" : ""}${showWelcome ? " sm-copilot-page--welcome" : ""}`}
      onKeyDown={(event) => {
        const inDialog =
          event.target instanceof Element &&
          event.target.closest('[role="dialog"], [role="alertdialog"]');
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !inDialog &&
          !drawerOpen &&
          !deleteOpen &&
          !event.nativeEvent.isComposing
        ) {
          event.stopPropagation();
          closeCopilot();
        }
      }}
    >
      <header className="sm-copilot-header">
        <div className="sm-copilot-header__identity">
          <div className="sm-copilot-mobile-only">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="sm-copilot-icon-button"
                  aria-label="Open conversation history"
                >
                  <PanelLeftOpen size={19} aria-hidden="true" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="sm-copilot-drawer">
                <SheetTitle className="sr-only">Conversation history</SheetTitle>
                <SheetDescription className="sr-only">
                  Choose a saved conversation or start a new chat.
                </SheetDescription>
                <CopilotHistory {...historyProps} />
              </SheetContent>
            </Sheet>
          </div>
          <span className="sm-copilot-mobile-brand">
            <CopilotIcon size={24} />
            <strong>ShelfMerch Copilot</strong>
          </span>
        </div>
        <div className="sm-copilot-header__actions">
          {activeId ? (
            <button
              type="button"
              className="sm-copilot-icon-button"
              onClick={() => setDeleteOpen(true)}
              disabled={locked}
              aria-label="Delete conversation"
              title="Delete conversation"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="sm-copilot-icon-button sm-copilot-header__close"
            onClick={closeCopilot}
            aria-label="Close Copilot"
            title="Close Copilot (Esc)"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
      </header>
      <aside className="sm-copilot-sidebar" aria-label="Conversation history">
        <CopilotHistory
          {...historyProps}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(true)}
          onExpand={() => setCollapsed(false)}
        />
      </aside>
      <section className="sm-copilot-chat" aria-label="AI conversation" aria-busy={locked}>
        {providerDisabled ? (
          <div className="sm-copilot-notice" role="status">
            <CircleAlert size={17} aria-hidden="true" />
            <span>
              <strong>Chat is currently unavailable.</strong> Explore capabilities and prepare a
              message. Contact your workspace administrator to enable replies.
            </span>
          </div>
        ) : null}
        <div
          className={`sm-copilot-messages${showWelcome ? " sm-copilot-messages--welcome" : ""}`}
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
            setScrolledUp(!nearBottom.current);
          }}
        >
          {opening ? (
            <div className="sm-copilot-loading" role="status">
              <LoaderCircle size={21} className="sm-copilot-spin" aria-hidden="true" />
              Opening conversation…
            </div>
          ) : !messages.length ? (
            <>
              <CopilotWelcome
                categories={status.discovery?.categories || []}
                selectedCategoryId={selectedCategoryId}
                onCategory={setSelectedCategoryId}
                onReload={() => void refetch()}
                onPrompt={(prompt) => {
                  setDraft(prompt);
                  document.getElementById("copilot-input")?.focus();
                }}
                onAction={handleDiscoveryAction}
              />
              {storeCreateOpen && status.writeToolsEnabled ? (
                <div className="sm-copilot-store-panel">
                  <CopilotStoreCreateForm
                    disabled={locked}
                    onPrepared={(artifact) => {
                      setStoreCreateOpen(false);
                      setMessages([
                        {
                          role: "assistant",
                          content: "Review the store details, then confirm to create and publish it.",
                          artifacts: [artifact],
                        },
                      ]);
                    }}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div
              className="sm-copilot-transcript"
              role="log"
              aria-label="Messages"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.map((message, index) => (
                <article
                  key={`${message.role}-${index}`}
                  className={`sm-copilot-message sm-copilot-message--${message.role}`}
                  aria-label={message.role === "user" ? "You" : "ShelfMerch Copilot"}
                >
                  {message.role === "assistant" ? (
                    <span className="sm-copilot-message__avatar">
                      <CopilotIcon size={30} />
                    </span>
                  ) : null}
                  <div className="sm-copilot-message__body">
                    {message.role === "assistant" ? (
                      <span className="sm-copilot-message__author">ShelfMerch Copilot</span>
                    ) : null}
                    <div className="sm-copilot-bubble">
                      {message.role === "assistant" ? (
                        <CopilotMarkdown content={message.content || ""} artifacts={message.artifacts} />
                      ) : (
                        <CopilotUserMessage content={message.content || ""} attachments={message.attachments} />
                      )}
                    </div>
                    {message.streaming ? (
                      <div className="sm-copilot-thinking" role="status">
                        <span className="sm-copilot-thinking__dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        {message.toolStatus === "running"
                          ? "Checking your workspace…"
                          : message.toolStatus === "error"
                            ? "Couldn’t complete a workspace lookup"
                            : message.content
                              ? "Writing…"
                              : "Thinking…"}
                      </div>
                    ) : null}
                    <CopilotArtifacts
                      artifacts={message.artifacts}
                      conversationId={activeId}
                      swag={swagControls}
                      onSwagEdit={() => void editSwag('products')}
                      currentSwagCollectionId={activeSwag?.collectionId}
                      onContinueSwag={!locked && !pendingSwag.length && !artworkReviewState ? () => void editSwag('design') : undefined}
                      onApplyLogo={!locked && !pendingSwag.length && !artworkReviewState && activeSwag?.artworkAttachmentId ? () => void changeSwag({ artwork: 'upload', step: 'design' }) : undefined}
                      onArtifactChange={(artifactIndex, next) =>
                        patchMessageArtifact(index, artifactIndex, next)
                      }
                    />
                  </div>
                </article>
              ))}
              {activeSwag ? <SwagWorkflowPanel key={activeSwag.conversationId} state={activeSwag} busy={locked || pendingSwag.length > 0 || artworkReviewState === 'unverified'} artworkReviewState={artworkReviewState} error={swag.error}
                hasCatalog={messages.some(message => message.artifacts?.some(artifact => artifact.kind === 'product'))}
                pending={pendingSwag.length > 0} change={changeSwag} prepare={prepareSwag} edit={editSwag}
                upload={() => document.getElementById('copilot-attach-swag_artwork')?.click()}
                uploadedArtwork={uploadedSwagArtwork ? { id: uploadedSwagArtwork.serverId!, name: uploadedSwagArtwork.originalName } : undefined} /> : null}
            </div>
          )}
        </div>
        {scrolledUp ? (
          <button
            type="button"
            className="sm-copilot-jump"
            onClick={() => {
              nearBottom.current = true;
              setScrolledUp(false);
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              });
            }}
          >
            <ArrowDown size={14} aria-hidden="true" />
            Latest message
          </button>
        ) : null}
        <div className="sm-copilot-compose-area">
          {error ? (
            <div className="sm-copilot-error" role="alert">
              <CircleAlert size={17} aria-hidden="true" />
              <span>{error.message}</span>
              {error.prompt ? (
                <button
                  type="button"
                  className="sm-copilot-text-button"
                  data-action="retry"
                  disabled={locked}
                  onClick={() => {
                    setDraft(error.prompt || "");
                    setError(null);
                    document.getElementById("copilot-input")?.focus();
                  }}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Edit & retry
                </button>
              ) : null}
              <button
                type="button"
                className="sm-copilot-icon-button"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <CopilotComposer
            draft={draft}
            onDraft={setDraft}
            onSend={(prompt) => void sendPrompt(prompt)}
            busy={busy}
            disabled={opening || deleting}
            unavailable={providerDisabled}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onUploadAttachment={(row) => void uploadAttachmentRow(row)}
            onRetryAttachment={retryAttachmentRow}
            onRemoveAttachment={(localId) => void removeAttachmentRow(localId)}
          />
        </div>
      </section>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm-copilot-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              “{activeTitle || "This conversation"}” will be permanently deleted. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep conversation</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeConversation()}>
              Delete conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export default CopilotPage;
