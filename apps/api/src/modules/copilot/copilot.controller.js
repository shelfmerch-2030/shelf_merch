import { env } from '../../config/env.js';
import { configureSwagForCaller, readSwagForCaller, browseSwagForCaller } from './swagDesignWorkflow.js';
import { swagStep, swagGuidance, currentCatalog } from './swagTimeline.js';
import { isWriteFlagEnabled } from './copilotWriteFlags.js';
import { CopilotConversation } from './copilotConversation.model.js';
import { serializeConfirmationArtifact } from './copilotToolBindings.js';
import { ApiError, ForbiddenError } from '../../utils/errors.js';
import { writeAudit } from '../../services/audit.service.js';
import { buildCopilotToolCtx } from './buildCallerCtx.js';
import { hidesOrganizationWallet } from '../mcp/walletVisibility.js';
import { restoreWalletSnapshots } from './copilotWalletReconcile.js';
import {
  capabilitiesForRole,
  isCopilotRole,
  isEmbeddedCopilotEnabled,
  resolveCopilotProviderStatus,
} from './copilotCapabilities.js';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  persistConversationWriteArtifact,
  streamAssistantTurn,
} from './copilotChat.service.js';
import {
  readSentSwagArtwork,
  removeCopilotAttachment,
  uploadCopilotAttachment,
} from './copilotAttachments.service.js';
import { registeredToolNames, activeCopilotTools } from './copilotTools.js';
import { webResearchEnabled } from './copilotWebResearch.js';
import { readSerpUsage } from './copilotSerpQuota.js';
import { discoveryForUser } from './copilotDiscovery.js';
import {
  cancelCopilotStoreCreate,
  executeCopilotStoreCreate,
  isStoreCreateWriteEnabled,
  prepareCopilotStoreCreate,
} from './copilotStoreCreate.service.js';
import {
  anyWriteDomainEnabled,
  writeDomainsStatus,
  prepareCopilotWrite,
  executeCopilotWrite,
  cancelCopilotWrite,
  resolveCopilotWrite,
} from './copilotWrites.service.js';

function requireEnabled(req) {
  if (!isEmbeddedCopilotEnabled()) {
    throw new ApiError(404, 'Embedded AI Copilot is not enabled', 'COPILOT_DISABLED');
  }
  if (!isCopilotRole(req.user?.role)) {
    throw new ForbiddenError('AI Copilot is not available for this role');
  }
}

function swagContext(req) {
  requireEnabled(req);
  if (!isWriteFlagEnabled('collections')) throw new ApiError(404, 'Swag Design is not enabled', 'COPILOT_WRITE_DISABLED');
  return { ...buildCopilotToolCtx(req), copilotConversationId: req.params.id };
}
export async function getSwag(req, res) {
  const state = await readSwagForCaller(swagContext(req));
  if (state?.active) {
    const conversation = await CopilotConversation.findOne({ _id: req.params.id, tenantId: req.tenantId, userId: req.user.userId });
    if (conversation?.messages.some(m => m.role === 'assistant' && (m.content || m.artifacts.length)) && !conversation.messages.some(m => m.artifacts.some(a => a.kind === 'swag_step'))) {
      // Explicit legacy compatibility: reconstruct one presentation event from
      // saved state, without replaying configuration, approval or execution.
      const pending = [...conversation.messages].reverse().flatMap(m => m.artifacts).find(a => a.kind === 'confirmation' && a.operation === 'swag.collection' && ['pending', 'consumed'].includes(a.status));
      const catalog = state.step === 'products' ? currentCatalog(conversation) : [];
      await CopilotConversation.updateOne({ _id: conversation._id, tenantId: req.tenantId, userId: req.user.userId,
        'swag.revision': state.revision, 'messages.artifacts.kind': { $ne: 'swag_step' } }, { $push: { messages: {
          role: 'assistant', uiEventId: `swag:legacy:${conversation._id}:${state.revision}`,
          content: pending ? 'Review the saved approval below, or check its status before making another change.' : swagGuidance(state),
          artifacts: pending ? [pending.toObject()] : [...catalog, swagStep(state, catalog.length ? 'gallery' : undefined)],
        } } });
    }
  }
  res.json({ state });
}
export async function configureSwag(req, res) {
  const { interaction, galleryEventId, ...patch } = req.body;
  let artworkPrompt;
  const state = await configureSwagForCaller({ ...swagContext(req), swagTimeline: true, swagInteraction: interaction, galleryEventId,
    onArtworkPrompt: transition => { artworkPrompt = transition; } }, patch);
  res.json({ state, ...(artworkPrompt ? { artworkPrompt } : {}) });
}
export async function getSentSwagArtwork(req, res) {
  requireEnabled(req);
  const bytes = await readSentSwagArtwork({ tenantId: req.tenantId, userId: req.user.userId,
    conversationId: req.params.id, attachmentId: req.params.attachmentId });
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).type('png').send(bytes);
}
export async function browseSwag(req, res) {
  res.json(await browseSwagForCaller(swagContext(req), { ...req.query, ...(req.query.revision !== undefined ? { revision: Number(req.query.revision) } : {}), page: Number(req.query.page || 1), limit: Number(req.query.limit || 6) }));
}
export async function prepareSwagReview(req, res) {
  swagContext(req);
  const prepared = await prepareCopilotWrite(req, 'swag.collection', { ...req.body, conversationId: req.params.id });
  const artifact = { kind: 'confirmation', operation: 'swag.collection', status: 'pending',
    confirmationId: prepared.confirmationId, expiresAt: prepared.expiresAt, preview: prepared.preview, request: prepared.request };
  const saved = await CopilotConversation.updateOne({ _id: req.params.id, tenantId: req.tenantId, userId: req.user.userId,
    'swag.revision': req.body.revision, 'messages.artifacts.confirmationId': { $ne: prepared.confirmationId } }, { $push: { messages: { role: 'assistant', content: req.body.action === 'apply' ? 'Your logo is ready. Review the products below and approve where it should be applied. Publishing is a separate step.' : 'Review the recorded collection details below.', artifacts: [artifact] } } });
  if (!saved.modifiedCount && !await CopilotConversation.exists({ _id: req.params.id, tenantId: req.tenantId, userId: req.user.userId, 'swag.revision': req.body.revision, 'messages.artifacts.confirmationId': prepared.confirmationId })) throw new ApiError(409, 'The selection changed. Review it again.', 'CONFIRMATION_STALE');
  res.json({ artifact });
}

export async function status(req, res) {
  const enabled = isEmbeddedCopilotEnabled() && isCopilotRole(req.user?.role);
  const provider = resolveCopilotProviderStatus();
  res.json({
    enabled,
    provider: provider.provider,
    selectedProvider: provider.selected,
    model: enabled ? provider.model : null,
    webResearchEnabled: enabled && webResearchEnabled(provider.provider),
    externalProductCardsEnabled: enabled && env.EMBEDDED_COPILOT_EXTERNAL_PRODUCT_CARDS_ENABLED === 'true',
    externalImageEnrichmentEnabled: enabled && env.EMBEDDED_COPILOT_EXTERNAL_IMAGE_ENRICHMENT_ENABLED === 'true',
    shoppingUsage: enabled ? await readSerpUsage({ tenantId: req.tenantId, userId: req.user?.userId }) : null,
    role: req.user?.role ?? null,
    capabilities: enabled ? capabilitiesForRole(req.user.role) : [],
    discovery: enabled
      ? discoveryForUser(req.user, {
          tools: activeCopilotTools(),
          writeToolsEnabled: anyWriteDomainEnabled(),
          writeDomains: writeDomainsStatus(),
        })
      : { categories: [] },
    // Internal diagnostics for tests — not shown in UI.
    allowlistedTools: enabled ? registeredToolNames() : [],
    writeToolsEnabled: enabled ? anyWriteDomainEnabled() : false,
    writeDomains: enabled ? writeDomainsStatus() : writeDomainsStatus(),
    // Back-compat alias used by older store-create tests.
    storeCreateWriteEnabled: enabled ? isStoreCreateWriteEnabled() : false,
  });
}

export async function prepareStoreCreate(req, res) {
  requireEnabled(req);
  const result = await prepareCopilotStoreCreate(req, req.body);
  res.json(result);
}

export async function executeStoreCreate(req, res) {
  requireEnabled(req);
  const result = await executeCopilotStoreCreate(req, req.body);
  res.json(result);
}

export async function cancelStoreCreate(req, res) {
  requireEnabled(req);
  const result = await cancelCopilotStoreCreate(req, req.body);
  res.json(result);
}

export async function prepareWrite(req, res) {
  requireEnabled(req);
  const result = await prepareCopilotWrite(req, req.params.workflow, req.body);
  res.json(result);
}

export async function executeWrite(req, res) {
  requireEnabled(req);
  const result = await executeCopilotWrite(req, req.params.workflow, req.body);
  res.json(result);
}

export async function cancelWrite(req, res) {
  requireEnabled(req);
  const result = await cancelCopilotWrite(req, req.params.workflow, req.body);
  res.json(result);
}

export async function resolveWrite(req, res) {
  requireEnabled(req);
  const result = await resolveCopilotWrite(req, req.params.workflow, req.body);
  res.json(result);
}

export async function persistWriteArtifact(req, res) {
  requireEnabled(req);
  const result = await persistConversationWriteArtifact({
    tenantId: req.tenantId,
    userId: req.user.userId,
    conversationId: req.params.id,
    confirmationId: req.body?.confirmationId,
    artifact: req.body?.artifact,
  });
  res.json(result);
}

export async function create(req, res) {
  requireEnabled(req);
  const conversation = await createConversation({
    tenantId: req.tenantId,
    userId: req.user.userId,
    title: req.body?.title,
  });
  res.status(201).json({
    id: String(conversation._id),
    title: conversation.title,
    createdAt: conversation.createdAt,
  });
}

export async function list(req, res) {
  requireEnabled(req);
  const items = await listConversations({
    tenantId: req.tenantId,
    userId: req.user.userId,
  });
  res.json({
    items: items.map((row) => ({
      id: String(row._id),
      title: row.title,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    })),
  });
}

export async function getOne(req, res) {
  requireEnabled(req);
  const conversation = await getConversation({
    tenantId: req.tenantId,
    userId: req.user.userId,
    conversationId: req.params.id,
  });
  const showWalletSnapshots = !hidesOrganizationWallet(req.user);
  if (showWalletSnapshots) restoreWalletSnapshots(conversation.messages);
  res.json({
    id: String(conversation._id),
    title: conversation.title,
    messages: conversation.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        ...(m.uiEventId ? { uiEventId: m.uiEventId } : {}),
        content: m.content,
        artifacts: (m.artifacts ?? [])
          .filter(artifact => showWalletSnapshots || artifact.kind !== 'wallet_balance')
          .map(serializeConfirmationArtifact),
        attachments: (m.attachments || []).map((row) => ({
          id: row.id,
          kind: row.kind,
          ticketId: row.ticketId || undefined,
          originalName: row.originalName,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
        })),
        createdAt: m.createdAt,
      })),
    updatedAt: conversation.updatedAt,
    curator: conversation.curator || null,
  });
}

export async function uploadAttachment(req, res) {
  requireEnabled(req);
  const attachment = await uploadCopilotAttachment({
    tenantId: req.tenantId,
    userId: req.user.userId,
    role: req.user.role,
    kind: req.attachmentKind || req.query.kind,
    file: req.file,
    conversationId: req.query.conversationId || null,
  });
  writeAudit({
    req,
    action: 'copilot.attachment_upload',
    entityType: 'CopilotAttachment',
    entityId: attachment.id,
    after: {
      kind: attachment.kind,
      ticketId: attachment.ticketId || null,
      originalName: attachment.originalName,
      sizeBytes: attachment.sizeBytes,
    },
  });
  res.status(201).json(attachment);
}

export async function removeAttachment(req, res) {
  requireEnabled(req);
  const result = await removeCopilotAttachment({
    tenantId: req.tenantId,
    userId: req.user.userId,
    attachmentId: req.params.id,
  });
  writeAudit({
    req,
    action: 'copilot.attachment_remove',
    entityType: 'CopilotAttachment',
    entityId: result.id,
    after: { status: 'removed' },
  });
  res.json(result);
}

export async function remove(req, res) {
  requireEnabled(req);
  await deleteConversation({
    tenantId: req.tenantId,
    userId: req.user.userId,
    conversationId: req.params.id,
  });
  res.json({ ok: true });
}

export async function postMessage(req, res) {
  requireEnabled(req);
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  const attachmentIds = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds : [];
  if (!content.trim() && !attachmentIds.length) {
    throw new ApiError(400, 'content or attachmentIds is required', 'VALIDATION');
  }
  if (content.length > env.EMBEDDED_COPILOT_MAX_INPUT_CHARS) {
    throw new ApiError(400, 'Message is too long', 'INPUT_TOO_LONG');
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const writeEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const abort = new AbortController();
  const onClose = () => abort.abort();
  req.on('close', onClose);

  try {
    await streamAssistantTurn({
      tenantId: req.tenantId,
      userId: req.user.userId,
      role: req.user.role,
      conversationId: req.params.id,
      content,
      attachmentIds,
      mode: req.body?.mode,
      lane: req.body?.lane,
      toolCtx: buildCopilotToolCtx(req),
      onEvent: writeEvent,
      signal: abort.signal,
    });
  } catch (err) {
    const status = err?.status || 500;
    const code = err?.code || 'COPILOT_ERROR';
    const message = err?.message || 'Copilot request failed';
    writeEvent({ type: 'error', status, code, message });
  } finally {
    req.off('close', onClose);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}
