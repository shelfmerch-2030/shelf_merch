import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import { CopilotResearchSources } from "./CopilotResearchSources";
import { CopilotUserMessage } from "./CopilotUserMessage";
import { CopilotIcon } from "./CopilotIcon";
import { CopilotWelcome } from "./CopilotWelcome";
import { CopilotComposer } from "./CopilotComposer";
import { useSwagConversation } from "./useSwagConversation";
import { SwagArtworkAcknowledgement, SwagStepMessage, SwagLogoPreview, swagPromptForDisplay } from "./SwagStepMessage";
import { isSwagPublishReview, projectSwagTimeline } from './swagTimeline';
import { SwagCompletedApproval } from './CopilotConfirmationCard';
import { swagArtworkCompletion, swagArtworkCompletionWarnings } from './swagPresentation';
import { browseSwagCatalog, type SwagCatalogQuery, type SwagPatch, type SwagStep } from "./swagApi";
import { CopilotHistory } from "./CopilotHistory";
import { CopilotStoreCreateForm } from "./CopilotStoreCreateConfirm";
import { useCopilotStatus } from "./useCopilotStatus";
import type { CopilotArtifact, CopilotAction } from "./api";
import "./copilot.css";

type UiMessage = CopilotMessage & { streaming?: boolean; toolStatus?: string; toolName?: string };
type UiError = { message: string; prompt?: string; reload?: string };
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
  const [lane, setLane] = useState<"shelfmerch" | "discover">("shelfmerch");
  const laneRef = useRef(lane);
  laneRef.current = lane;
  const [attachments, setAttachments] = useState<CopilotAttachmentDraft[]>([]);
  const attachmentRows = useRef(attachments);
  attachmentRows.current = attachments;
  const uploadsInFlight = useRef(new Set<string>());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [storeCreateOpen, setStoreCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const openingRequest = useRef<{ id: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const swagMessagesRequest = useRef(0);
  const swagUiLock = useRef(false);
  const [swagUiBusy, setSwagUiBusy] = useState(false);
  const streamsRef = useRef(new Map<string | number, StreamingConversation>());
  const viewKeyRef = useRef<string | number>(0);
  const newViewKeyRef = useRef(0);
  const historyLoadedRef = useRef(false);
  const historyRequestRef = useRef(false);
  const lockRef = useRef(false);
  const mounted = useRef(true);
  const nearBottom = useRef(true);
  const lastScrollTop = useRef(0);
  const savedScrollPositions = useRef(new Map<string, number>());
  const scrollIntent = useRef<"sent" | "latest" | { top: number } | null>(null);
  const previousTranscript = useRef({ count: 0, busy: false });
  const [selection, setSelection] = useState<{ conversationId: string; productId: string; source: 'card' | 'chip' } | null>(null);
  const selectionAction = useRef<typeof selection>(null);
  const selectionScroll = useRef<{ conversationId: string; top: number } | null>(null);
  const swag = useSwagConversation(activeId, status?.role === 'company_admin' && status?.writeDomains?.collections === true);
  const activeSelection = selection?.conversationId === activeId ? selection : null;
  const workspaceBusy = busy || opening || deleting || swagUiBusy;
  const locked = workspaceBusy || swag.busy || Boolean(activeSelection);
  const pendingSwag = messages.flatMap(message => message.artifacts || []).filter(artifact => artifact.kind === 'confirmation' && artifact.operation === 'swag.collection' && artifact.status === 'pending');
  const activeSwag = swag.state?.active ? swag.state : null;
  const artworkReviews = messages.flatMap(message => message.artifacts || []).filter(artifact => artifact.kind === 'confirmation'
    && artifact.operation === 'swag.collection' && artifact.request?.action === 'apply' && artifact.request?.revision === activeSwag?.revision);
  const artworkReviewState = artworkReviews.some(artifact => artifact.kind === 'confirmation' && ['consumed', 'unverified'].includes(artifact.status || '')) ? 'unverified'
    : artworkReviews.some(artifact => artifact.kind === 'confirmation' && ['cancelled', 'expired', 'failed'].includes(artifact.status || '')) ? 'dismissed' : undefined;
  const uploadedSwagArtwork = attachments.find(row => row.kind === 'swag_artwork' && row.status === 'uploaded' && row.serverId);
  const hasSentSwagArtwork = messages.some(message => message.attachments?.some(file => file.kind === 'swag_artwork' && file.id === activeSwag?.artworkAttachmentId));
  const swagControls = activeSwag ? { selectedIds: activeSwag.productIds, busy: locked || pendingSwag.length > 0 || artworkReviewState === 'unverified',
    onToggle: (id: string) => void changeSwag(activeSwag.productIds.includes(id) ? { removeProductIds: [id] } : { addProductIds: [id] }) } : undefined;
  const timeline = projectSwagTimeline(messages, activeSwag);
  const latestTimelineIndex = timeline.filter(row => row.visible).at(-1)?.index;
  useEffect(() => {
    if (activeSwag && !busy && !opening && !messages.some(m => m.artifacts?.some(a => a.kind === 'swag_step'))) void reloadSwagMessages(activeSwag.conversationId);
  }, [activeSwag?.conversationId, activeSwag?.revision, busy, opening]);
  const providerDisabled = status?.provider === "disabled";
  const activeTitle = conversations.find((row) => row.id === activeId)?.title;
  const showWelcome = !messages.length && !busy;

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
    if (uploadsInFlight.current.has(row.localId)) return;
    uploadsInFlight.current.add(row.localId);
    const target = viewKeyRef.current;
    patchAttachment(row.localId, { status: "uploading", error: undefined });
    try {
      const uploaded = await uploadCopilotAttachmentApi(row.kind, row.file, activeId);
      if (!mounted.current || (row.kind === 'swag_artwork' && (viewKeyRef.current !== target || !attachmentRows.current.some(item => item.localId === row.localId)))) {
        if (row.kind === 'swag_artwork') void removeCopilotAttachmentApi(uploaded.id).catch(() => {});
        return;
      }
      patchAttachment(row.localId, {
        status: "uploaded",
        serverId: uploaded.id,
        ticketId: uploaded.ticketId,
        originalName: uploaded.originalName || row.originalName,
        mimeType: uploaded.mimeType || row.mimeType,
        sizeBytes: uploaded.sizeBytes || row.sizeBytes,
      });
    } catch (err) {
      if (!mounted.current) return;
      patchAttachment(row.localId, {
        status: "failed",
        error: err instanceof Error ? err.message : "Upload failed",
      });
    } finally { uploadsInFlight.current.delete(row.localId); }
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
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const previous = previousTranscript.current;
    previousTranscript.current = { count: messages.length, busy };
    const intent = scrollIntent.current;
    scrollIntent.current = null;
    if (showWelcome) el.scrollTop = 0;
    else if (intent === "latest") el.scrollTop = el.scrollHeight;
    else if (intent === "sent") {
      const submitted = transcriptRef.current?.querySelector<HTMLElement>(
        ".sm-copilot-message--user:nth-last-child(2), .sm-copilot-message--user:last-child",
      );
      if (submitted) {
        const viewport = el.getBoundingClientRect();
        const rect = submitted.getBoundingClientRect();
        if (rect.top < viewport.top || rect.bottom > viewport.bottom - 16) {
          el.scrollTop += rect.bottom - viewport.bottom + 16;
        }
      }
    } else if (intent) el.scrollTop = intent.top;
    else if (!busy && !previous.busy && messages.length > previous.count && nearBottom.current
      && selectionScroll.current?.conversationId !== viewKeyRef.current) el.scrollTop = el.scrollHeight;
    lastScrollTop.current = el.scrollTop;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottom.current = gap <= 2 || (nearBottom.current && gap < 90);
    setScrolledUp(!showWelcome && gap >= 24);
  }, [messages.length, busy, showWelcome, selectedCategoryId, activeId, opening]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setScrolledUp(!showWelcome && el.scrollHeight - el.scrollTop - el.clientHeight >= 24));
    observer.observe(el);
    if (transcriptRef.current) observer.observe(transcriptRef.current);
    return () => observer.disconnect();
  }, [status?.enabled, showWelcome, activeId]);
  useLayoutEffect(() => {
    const position = selectionScroll.current;
    const el = scrollRef.current;
    if (!position || !el || position.conversationId !== viewKeyRef.current) return;
    el.scrollTop = position.top;
    let settledFrame = 0;
    const frame = requestAnimationFrame(() => {
      settledFrame = requestAnimationFrame(() => {
        if (selectionScroll.current === position) selectionScroll.current = null;
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(settledFrame); };
  }, [messages]);

  function startNew() {
    if (lockRef.current) return;
    openingRequest.current = null;
    setOpening(false);
    ++swagMessagesRequest.current;
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
      if (next.kind === 'success' && next.result?.action === 'publish' && next.result.published === true && next.result.status === 'ready') {
        if (!activeId || viewKeyRef.current !== activeId) return;
        const review = messages[messageIndex];
        setMessages(previous => previous.map(message => message.uiEventId === review?.uiEventId && message.artifacts?.some(a => isSwagPublishReview(a) && a.confirmationId === next.confirmationId)
          ? { ...message, artifacts: message.artifacts.map(a => isSwagPublishReview(a) && a.confirmationId === next.confirmationId ? { ...a, status: 'completed' } : a) }
          : message));
        void swag.refresh(activeId);
        void reloadSwagMessages(activeId).catch(() => {
          if (viewKeyRef.current === activeId) setError({ message: 'Publication was confirmed. Reopen this chat to view the saved result.', reload: activeId });
        });
        return;
      }
      void swag.refresh();
      if (activeId) void reloadSwagMessages(activeId);
      if (next.kind === 'success') return; // The canonical result is appended by the backend.
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
    const request = ++swagMessagesRequest.current;
    const detail = await getCopilotConversation(id);
    if (mounted.current && viewKeyRef.current === id && request === swagMessagesRequest.current && !streamsRef.current.has(id)) setMessages(previous => detail.messages.map((message, index) =>
      JSON.stringify(previous[index]) === JSON.stringify(message) ? previous[index] : message));
  }
  async function prepareSwag(action: 'save' | 'publish' | 'apply', expectedRevision?: number) {
    const id = activeId;
    if (!id || viewKeyRef.current !== id || pendingSwag.length) return;
    await swag.prepare(action, expectedRevision);
    // Includes recovery of a server-persisted preview if the HTTP acknowledgement was lost.
    try { await reloadSwagMessages(id); } catch (err) { if (viewKeyRef.current === id) setError({ message: err instanceof Error ? err.message : 'Could not reload confirmation. Check conversation status before preparing again.' }); }
  }
  async function editSwag(step: SwagStep) {
    const target = viewKeyRef.current;
    if (viewKeyRef.current !== activeId) return;
    try {
      for (const artifact of pendingSwag) if (artifact.kind === 'confirmation') await cancelCopilotWriteApi('swag.collection', artifact.confirmationId);
      await changeSwag({ step });
    } catch (err) { if (viewKeyRef.current === target) setError({ message: err instanceof Error ? err.message : 'Could not dismiss the old confirmation. Check its status before editing.' }); }
  }
  async function changeSwag(patch: SwagPatch) {
    const target = viewKeyRef.current;
    const focused = document.activeElement as HTMLElement | null;
    const focusWasInTimeline = Boolean(focused && transcriptRef.current?.contains(focused));
    const productFocus = focused?.dataset.swagProductId;
    let appendedArtworkPrompt = false;
    const result = await swag.change(patch, patch.step === 'artwork' && activeSwag?.step === 'products' ? {
      acknowledge: (_state, transition) => {
        if (!transition || !activeId || viewKeyRef.current !== target || streamsRef.current.has(target)
          || messages.at(-1)?.uiEventId !== transition.previousEventId) return;
        ++swagMessagesRequest.current;
        appendedArtworkPrompt = true;
        setMessages(previous => previous.at(-1)?.uiEventId === transition.previousEventId ? [...previous, ...transition.messages] : previous);
      },
    } : undefined);
    if (activeId && !appendedArtworkPrompt) {
      try { await reloadSwagMessages(activeId); } catch { if (viewKeyRef.current === target) setError({ message: 'Could not reload the latest design activity. Reopen this conversation to check its saved state.' }); }
    }
    if (result && patch.artwork === 'none') {
      for (const row of attachments.filter(row => row.kind === 'swag_artwork')) await removeAttachmentRow(row.localId);
    }
    if (result && viewKeyRef.current === activeId && focused && focusWasInTimeline) requestAnimationFrame(() => {
      if (viewKeyRef.current !== activeId || document.activeElement !== focused && document.activeElement !== document.body) return;
      const latest = transcriptRef.current?.querySelector('.sm-copilot-message:last-child');
      const target = productFocus ? latest?.querySelector<HTMLElement>(`[data-swag-product-id="${productFocus}"]`) : latest?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)');
      target?.focus({ preventScroll: true });
    });
    return result;
  }
  async function changeGallerySelection(galleryEventId: string, productId: string, remove: boolean, source: 'card' | 'chip' = 'card') {
    if (!activeId || viewKeyRef.current !== activeId || locked || swagUiLock.current || selectionAction.current?.conversationId === activeId
      || pendingSwag.length || artworkReviewState === 'unverified') return;
    const action = { conversationId: activeId, productId, source };
    selectionAction.current = action;
    setSelection(action);
    // Invalidate any history read started before the mutation acknowledgement.
    ++swagMessagesRequest.current;
    const patch = remove ? { removeProductIds: [productId] } : { addProductIds: [productId] };
    try {
      const result = await swag.change(patch, { eventId: galleryEventId, acknowledge: state => {
        if (viewKeyRef.current !== action.conversationId || selectionAction.current !== action) return;
        if (scrollRef.current) selectionScroll.current = { conversationId: action.conversationId, top: scrollRef.current.scrollTop };
        setMessages(previous => previous.map(message => message.uiEventId === galleryEventId ? {
          ...message, artifacts: message.artifacts?.map(artifact => artifact.kind === 'swag_step'
            ? { ...artifact, swag: { ...artifact.swag, revision: state.revision } } : artifact),
        } : message));
      } });
      if (!result && viewKeyRef.current === action.conversationId && selectionAction.current === action) {
        try { await reloadSwagMessages(action.conversationId); }
        catch { if (viewKeyRef.current === action.conversationId) setError({ message: 'Could not reload the latest design activity. Reopen this conversation to check its saved state.' }); }
      }
      return result;
    } finally {
      if (selectionAction.current === action) selectionAction.current = null;
      setSelection(previous => previous === action ? null : previous);
    }
  }
  function preserveSwagDisclosureScroll() {
    const el = scrollRef.current;
    if (!el || !activeId) return;
    const position = { conversationId: activeId, top: el.scrollTop };
    selectionScroll.current = position;
    requestAnimationFrame(() => {
      if (viewKeyRef.current === position.conversationId && selectionScroll.current === position) el.scrollTop = position.top;
      requestAnimationFrame(() => { if (selectionScroll.current === position) selectionScroll.current = null; });
    });
  }
  async function browseSwag(query: SwagCatalogQuery) {
    const id = activeId;
    if (!id || !activeSwag || locked || swagUiLock.current || selectionAction.current?.conversationId === id || viewKeyRef.current !== id) return;
    swagUiLock.current = true; setSwagUiBusy(true);
    try { await browseSwagCatalog(id, { ...query, revision: activeSwag.revision }); await reloadSwagMessages(id); }
    catch (err) { if (viewKeyRef.current === id) setError({ message: err instanceof Error ? err.message : 'Could not load products. Reopen the conversation to check the current selection.' }); }
    finally { swagUiLock.current = false; if (mounted.current) setSwagUiBusy(false); }
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
      if (!providerDisabled && !attachments.length) {
        void sendPrompt(action.prompt);
        return;
      }
      setDraft(action.prompt);
      document.getElementById("copilot-input")?.focus();
    }
  }
  async function openConversation(id: string, reload = false) {
    if (lockRef.current || openingRequest.current?.id === id) return;
    setDrawerOpen(false);
    if (!reload && viewKeyRef.current === id) {
      openingRequest.current = null;
      setOpening(false);
      return;
    }
    const request = { id };
    openingRequest.current = request;
    const isCurrent = () => mounted.current && openingRequest.current === request;
    ++swagMessagesRequest.current;
    setOpening(true);
    setError(null);
    try {
      const streaming = streamsRef.current.get(id);
      const detail = streaming ? { messages: streaming.messages } : await getCopilotConversation(id);
      if (!isCurrent()) return;
      const currentView = viewKeyRef.current;
      const currentTop = scrollRef.current?.scrollTop ?? 0;
      if (typeof currentView === "string") savedScrollPositions.current.set(currentView, currentTop);
      const savedTop = savedScrollPositions.current.get(id);
      scrollIntent.current = savedTop === undefined ? "latest" : { top: savedTop };
      setActiveId(id);
      viewKeyRef.current = id;
      setBusy(streamsRef.current.has(id));
      setSelectedCategoryId(null);
      setStoreCreateOpen(false);
      setMessages(
        detail.messages.filter(
          (message) => Boolean(streaming) || message.role === "user" || message.content || message.artifacts?.length,
        ),
      );
      setDraft("");
      clearAttachments();
    } catch (err) {
      if (isCurrent())
        setError({
          message:
            err instanceof Error
              ? err.message
              : "Couldn’t open this conversation. Please select it again.",
        });
    } finally {
      if (isCurrent()) {
        openingRequest.current = null;
        setOpening(false);
      }
    }
  }
  async function removeConversation() {
    if (!activeId || lockRef.current || openingRequest.current) return;
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
      openingRequest.current ||
      selectionAction.current?.conversationId === viewKeyRef.current ||
      swag.busy ||
      swagUiBusy ||
      streamsRef.current.has(viewKeyRef.current) ||
      !status?.enabled ||
      providerDisabled ||
      attachments.some((row) => row.status === "uploading" || row.status === "selected" || row.status === "failed")
    ) {
      return;
    }
    let streamKey = viewKeyRef.current;
    ++swagMessagesRequest.current;
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
    scrollIntent.current = "sent";
    stream.messages = [
      ...messages,
      {
        role: "user",
        content: content || (pendingAttachments.length === 1 && pendingAttachments[0].kind === 'swag_artwork' ? '' : `Attached ${pendingAttachments.length} file(s)`),
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
          onDelta: (text, replace) =>
            updateAssistant((message) => ({ ...message, content: replace ? text : message.content + text })),
          onArtifacts: (rows) =>
            updateAssistant((message) => ({
              ...message,
              artifacts: [...(message.artifacts || []), ...rows],
            })),
          onTool: (toolName, toolStatus) => updateAssistant((message) => ({ ...message, toolName, toolStatus })),
          onDone: ({ title }) => {
            void swag.refresh(id);
            if (laneRef.current === "discover") void refetch();
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
            setError({ message: nextMessage, ...(code === 'SWAG_REPLY_RELOAD_REQUIRED' ? { reload: id ?? undefined } : { prompt: content }) });
          },
        },
        stream.controller.signal,
        attachmentIds,
        "chat",
        laneRef.current,
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
          if (status?.writeDomains?.collections && typeof streamKey === 'string') {
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
    locked: deleting,
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
  const composer = (
    <div className="sm-copilot-compose-area">
      {scrolledUp && !opening ? (
        <button
          type="button"
          className="sm-copilot-jump"
          onClick={() => {
            nearBottom.current = true;
            setScrolledUp(false);
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "auto",
            });
          }}
        >
          <ArrowDown size={14} aria-hidden="true" />
          Latest message
        </button>
      ) : null}
      {error ? (
        <div className="sm-copilot-error" role="alert">
          <CircleAlert size={17} aria-hidden="true" />
          <span>{error.message}</span>
          {error.reload ? <button type="button" className="sm-copilot-text-button" disabled={locked} onClick={() => void openConversation(error.reload!, true)}>Reload conversation</button> : null}
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
        lane={lane}
        onLane={setLane}
        showLanes={showWelcome}
        busy={busy}
        disabled={opening || deleting || (swag.busy && !activeSelection) || swagUiBusy}
        sendBlocked={Boolean(activeSelection)}
        unavailable={providerDisabled}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        onUploadAttachment={(row) => void uploadAttachmentRow(row)}
        onRetryAttachment={retryAttachmentRow}
        onRemoveAttachment={(localId) => void removeAttachmentRow(localId)}
        shoppingUsage={status?.shoppingUsage}
        onUsageOpen={() => void refetch()}
      />
    </div>
  );
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
      <section className="sm-copilot-chat" aria-label="AI conversation" aria-busy={locked && !opening}>
        {providerDisabled ? (
          <div className="sm-copilot-notice" role="status">
            <CircleAlert size={17} aria-hidden="true" />
            <span>
              <strong>Chat is currently unavailable.</strong> Explore capabilities and prepare a
              message. Contact your workspace administrator to enable replies.
            </span>
          </div>
        ) : null}
        {opening && <div className="sm-copilot-switch-status" role="status">
          <LoaderCircle size={16} className="sm-copilot-spin" aria-hidden="true" />
          Opening conversation…
        </div>}
        <div
          className={`sm-copilot-messages${showWelcome ? " sm-copilot-messages--welcome" : ""}`}
          ref={scrollRef}
          inert={opening}
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
            nearBottom.current = gap <= 2 || (nearBottom.current && gap < 90 && el.scrollTop >= lastScrollTop.current);
            lastScrollTop.current = el.scrollTop;
            if (typeof viewKeyRef.current === "string") savedScrollPositions.current.set(viewKeyRef.current, el.scrollTop);
            setScrolledUp(!showWelcome && gap >= 24);
          }}
        >
          {!messages.length ? (
            <>
              <CopilotWelcome
                lane={lane}
                categories={status.discovery?.categories || []}
                selectedCategoryId={selectedCategoryId}
                onCategory={setSelectedCategoryId}
                onReload={() => void refetch()}
                onPrompt={(prompt) => {
                  setDraft(prompt);
                  document.getElementById("copilot-input")?.focus();
                }}
                onAction={handleDiscoveryAction}
              >
                {composer}
              </CopilotWelcome>
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
              ref={transcriptRef}
              role="log"
              aria-label="Messages"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {timeline.map(({ message, index, artifacts, step, active, completedApproval, artworkResult, suppressCompletedReview, earlierReview, visible }) => {
                if (!visible) return null;
                const publishReview = artifacts.find(isSwagPublishReview);
                const webResearch = artifacts.find(row => row.kind === "web_research")?.research;
                const publishResult = artifacts.some(a => a.kind === 'success' && a.operation === 'swag.collection' && a.result?.action === 'publish');
                const reviewPreview = publishReview?.preview;
                const selected = reviewPreview?.products;
                const designs = reviewPreview?.designs;
                const allCustomized = Array.isArray(selected) && selected.length > 0 && Array.isArray(designs)
                  && selected.every(product => designs.some(design => design.productId === product.id && design.mockupUrl));
                const swagReadOnly = index !== latestTimelineIndex || artifacts.some(a => a.kind === 'confirmation' && a.operation === 'swag.collection' && a.status === 'pending' && a.request?.revision !== activeSwag?.revision);
                const hasCatalog = artifacts.some(a => a.kind === 'product');
                const selectedProducts = step?.swag.selectedProducts;
                const selectedCatalogProducts = selectedProducts?.length ? [
                  ...(active ? activeSwag?.products ?? [] : []),
                  ...messages.slice(0, index).flatMap(row => (row.artifacts ?? []).flatMap(a => a.kind === 'product' ? [a.product] : [])),
                ] : undefined;
                const galleryEventId = active && hasCatalog && activeSwag?.step === 'products' ? message.uiEventId : undefined;
                const renderSwagStep = active && activeSwag && !pendingSwag.length ? (exploreMore?: ReactNode) => (
                  <SwagStepMessage state={activeSwag} mode={step?.swag.mode} busy={locked || artworkReviewState === 'unverified'}
                    manualRequired={swag.errorCode === 'DESIGN_REQUIRED'} exploreMore={exploreMore}
                    pendingRemovalId={galleryEventId && activeSelection?.source === 'chip' ? activeSelection.productId : undefined}
                    selectionError={hasCatalog && activeSwag.step === 'products' ? swag.error : undefined}
                    onSelectionDisclosure={preserveSwagDisclosureScroll}
                    hasCatalog={hasCatalog} hasComposerLogo={hasSentSwagArtwork || Boolean(uploadedSwagArtwork && uploadedSwagArtwork.serverId === activeSwag.artworkAttachmentId)}
                    change={patch => galleryEventId && patch.removeProductIds?.length === 1
                      ? changeGallerySelection(galleryEventId, patch.removeProductIds[0], true, 'chip') : changeSwag(patch)} edit={editSwag} prepare={prepareSwag}
                    upload={() => document.getElementById('copilot-attach-swag_artwork')?.click()} />
                ) : undefined;
                const catalogFooter = hasCatalog && activeSwag?.step === 'products' ? renderSwagStep : undefined;
                const showsAssistantText = message.role === "assistant"
                  && !artworkResult && !completedApproval && !publishReview && !publishResult
                  && !suppressCompletedReview && !earlierReview;
                const replyText = showsAssistantText ? swagPromptForDisplay(message.content || "", step?.swag.step) : "";
                return (
                <article
                  key={`${activeId || "draft"}:${message.uiEventId || `${message.role}-${index}`}`}
                  className={`sm-copilot-message sm-copilot-message--${message.role}`}
                  aria-label={message.role === "user" ? "You" : "Assistant"}
                >
                  <div className={`sm-copilot-message__body${message.role === 'user' && message.attachments?.length ? ' sm-copilot-message__body--attachments' : ''}`}>
                    <div className="sm-copilot-bubble">
                      {message.role === "assistant" ? (
                        artworkResult ? <>
                          <CopilotMarkdown content={swagArtworkCompletion(artworkResult)} />
                          {swagArtworkCompletionWarnings(artworkResult).map(warning => <p className="sm-swag-warning" key={warning}>{warning}</p>)}
                        </>
                          : completedApproval ? <SwagCompletedApproval artifact={completedApproval} />
                          : publishReview ? publishReview.status === 'pending' && !swagReadOnly
                            ? <p className="sm-swag-publish-intro">{allCustomized ? 'Your collection is ready! Review your customized products before publishing.' : 'Your collection is ready! Review your products before publishing.'}</p> : null
                          : publishResult || suppressCompletedReview ? null
                          : earlierReview ? <details className="sm-swag-history"><summary>Earlier review</summary><CopilotMarkdown content={message.content || ""} artifacts={message.artifacts} /><CopilotArtifacts artifacts={message.artifacts?.filter(a => a.kind === 'confirmation')} swagReadOnly conversationId={activeId} /></details>
                          : <>{selectedProducts?.length ? <SwagArtworkAcknowledgement products={selectedProducts} catalogProducts={selectedCatalogProducts} /> : null}
                            <CopilotMarkdown content={replyText} artifacts={artifacts} /></>
                      ) : (
                        <CopilotUserMessage content={message.content || ""} attachments={message.attachments} conversationId={message.uiEventId || !busy ? activeId : undefined} />
                      )}
                    </div>
                    {message.streaming && !webResearch ? (
                      <div className="sm-copilot-thinking" role="status">
                        <span className="sm-copilot-thinking__dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        {message.toolStatus === "running"
                          ? message.toolName === "web_search" ? "Searching public web sources…" : "Checking your workspace…"
                          : message.toolStatus === "error"
                            ? "Couldn’t complete a workspace lookup"
                            : message.content
                              ? "Writing…"
                              : "Thinking…"}
                      </div>
                    ) : null}
                    {webResearch ? <CopilotResearchSources research={webResearch} /> : null}
                    {artifacts.some(row => row.kind === "product" || row.kind === "kit")
                      ? <p className="sm-copilot-md sm-copilot-research sm-copilot-section-label"><strong>Verified ShelfMerch products</strong></p> : null}
                    <CopilotArtifacts
                      artifacts={completedApproval ? artifacts.filter(a => a !== completedApproval) : artifacts}
                      assistantReply={showsAssistantText ? { text: replyText, streaming: message.streaming } : undefined}
                      conversationId={activeId}
                      swag={step ? { selectedIds: activeSwag?.productIds || [], busy: galleryEventId && activeSelection ? workspaceBusy : locked,
                        selectionPending: Boolean(galleryEventId && activeSelection), pendingProductId: galleryEventId && activeSelection?.source === 'card' ? activeSelection.productId : undefined, readOnly: !active,
                        onToggle: galleryEventId ? id => void changeGallerySelection(galleryEventId, id, Boolean(activeSwag?.productIds.includes(id)))
                          : swagControls?.onToggle || (() => {}) } : undefined}
                       swagReadOnly={swagReadOnly}
                      onSwagBrowse={active ? browseSwag : undefined}
                      renderSwagFooter={catalogFooter}
                      onSwagEdit={() => void editSwag('products')}
                      currentSwagCollectionId={activeSwag?.collectionId}
                      onContinueSwag={undefined}
                      onApplyLogo={undefined}
                      onArtifactChange={(artifactIndex, next) =>
                        patchMessageArtifact(index, artifactIndex, next)
                      }
                    />
                    {index === latestTimelineIndex && activeSwag && artifacts.some(a => a.kind === 'confirmation' && a.operation === 'swag.collection' && ['cancelled', 'expired'].includes(a.status || '')) ? <button type="button" className="sm-copilot-confirm__cancel" disabled={locked} onClick={() => void editSwag('design')}>Review current design</button> : null}
                    {index === latestTimelineIndex && activeSwag && artifacts.some(a => a.kind === 'confirmation' && a.operation === 'swag.collection' && a.request?.action === 'apply') ? <SwagLogoPreview state={activeSwag} hasComposerLogo={hasSentSwagArtwork || Boolean(uploadedSwagArtwork)} /> : null}
                    {renderSwagStep ? <>
                      {swag.error && !catalogFooter ? <p role="alert" className="sm-copilot-attach-error">{swag.error}</p> : null}
                      {!catalogFooter && renderSwagStep()}
                    </> : null}
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </div>
        {showWelcome ? null : composer}
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
