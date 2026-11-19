import { createHash } from 'node:crypto';
import { CopilotConversation } from './copilotConversation.model.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/errors.js';

const plain = value => value?.toObject ? value.toObject() : value;
export function swagRequestFilter(conversation, requestId) {
  return { _id: conversation._id, tenantId: conversation.tenantId, userId: conversation.userId, archivedAt: null,
    'messages.uiEventId': requestId,
    $expr: { $and: [
      { $let: { vars: { last: { $arrayElemAt: [{ $filter: { input: '$messages', as: 'message', cond: { $eq: ['$$message.role', 'user'] } } }, -1] } }, in: { $eq: ['$$last.uiEventId', requestId] } } },
      { $not: [{ $regexMatch: { input: { $ifNull: [{ $arrayElemAt: ['$messages.uiEventId', -1] }, ''] }, regex: '^swag:receipt:' } }] },
    ] },
  };
}

/** Presentation-only append. State-changing services keep their strict revision
 * checks. A superseded reply must not revive old controls or require a replay. */
export async function appendSwagResponse({ conversation, requestId, messages, state, readState }) {
  const responseId = `swag:reply:${requestId}`;
  const owner = { _id: conversation._id, tenantId: conversation.tenantId, userId: conversation.userId, archivedAt: null };
  const request = {
    ...swagRequestFilter(conversation, requestId), $and: [{ 'messages.uiEventId': { $ne: responseId } }],
  };
  // Empty state is a virtual revision zero. Reading it must not create state.
  const atRevision = revision => revision === 0 ? { $or: [{ 'swag.revision': 0 }, { swag: { $exists: false } }] } : { 'swag.revision': revision };
  const rows = messages.map(plain);
  const final = rows.findLast(message => message.role === 'assistant' && (message.content?.trim() || message.artifacts?.length));
  if (final) final.uiEventId = responseId;
  const result = await CopilotConversation.updateOne({ ...request, ...atRevision(state.revision) }, { $push: { messages: { $each: rows } }, $set: { title: conversation.title } });
  if (result.modifiedCount) return { reconciled: false };
  const latest = await CopilotConversation.findOne(owner).lean();
  if (!latest) throw new ApiError(404, 'Conversation not found', 'COPILOT_NOT_FOUND');
  const latestUser = latest.messages.findLast(message => message.role === 'user');
  let reason = latest.messages.some(message => message.uiEventId === responseId) ? 'already_appended' : latestUser?.uiEventId !== requestId ? 'newer_request' : 'newer_revision';
  if (reason === 'newer_revision' && !latest.messages.slice(latest.messages.findLastIndex(message => message.role === 'user') + 1).some(message => message.uiEventId?.startsWith('swag:receipt:'))) {
    // One bounded read-only reconciliation. Discard old prose/approvals, derive
    // guidance from current authorized state, and retain both request and fence.
    const current = await readState();
    const recovered = await CopilotConversation.updateOne({ ...request, ...atRevision(current.revision) }, { $push: { messages: {
      role: 'assistant', uiEventId: responseId, content: swagGuidance(current), artifacts: [swagStep(current)],
    } } });
    if (!recovered.modifiedCount) {
      const verified = await CopilotConversation.findOne(owner).lean();
      if (!verified) throw new ApiError(404, 'Conversation not found', 'COPILOT_NOT_FOUND');
      if (verified.messages.findLast(message => message.role === 'user')?.uiEventId === requestId
        && !verified.messages.some(message => message.uiEventId === responseId)
        && !verified.messages.slice(verified.messages.findLastIndex(message => message.role === 'user') + 1).some(message => message.uiEventId?.startsWith('swag:receipt:'))) {
        throw new ApiError(409, 'Your latest design is saved. Reload this conversation to continue.', 'SWAG_REPLY_RELOAD_REQUIRED');
      }
    }
  }
  logger.info({ conversationId: String(conversation._id), requestId, responseId, expectedRevision: state.revision,
    currentRevision: latest.swag?.revision ?? 0, reason }, 'Swag presentation response reconciled without replay');
  return { reconciled: true, reason };
}
export function swagStep(state, mode) {
  return { kind: 'swag_step', swag: { conversationId: state.conversationId, revision: state.revision, step: state.step || 'name', ...(mode ? { mode } : {}) } };
}
export function swagArtworkPromptStep(state) {
  const step = swagStep(state);
  step.swag.selectedProducts = state.products.map(({ id, name, primaryImageUrl, images }) => ({
    id, name, imageUrl: primaryImageUrl || images?.[0] || '',
  }));
  return step;
}
export const SWAG_BROWSE_QUESTION = 'Would you like me to show you some products?';

export function swagGuidance(state, { named = false, mode } = {}) {
  if (mode === 'paused') return `Your ${state.name} design is saved for later. Continue whenever you’re ready.`;
  if (named) return `I've named your collection **${state.name}**. ${SWAG_BROWSE_QUESTION}`;
  if (state.step === 'name') return 'What would you like to name your collection?';
  if (state.step === 'products') return state.productIds?.length
    ? `${state.productIds.length} product${state.productIds.length === 1 ? '' : 's'} added. Choose more, or continue to your logo.`
    : mode === 'gallery' ? 'Selection updated. Choose products below, or tell me what else to find.' : SWAG_BROWSE_QUESTION;
  if (state.step === 'artwork') return 'Would you like to add your company logo? You can upload it using the + button below, or continue without one.';
  if (state.step === 'design') return state.artwork === 'upload'
    ? state.automaticArtworkAvailable === false ? "I've received your logo. Automatic logo application isn't available in this workspace right now. Would you like to use the designer for placement?" : "I've received your logo. Would you like me to apply it to your selected products?"
    : state.artwork === 'none' ? 'We’ll continue without a logo. Ready to choose a store?'
      : state.designReady === false ? 'Your draft is saved. Finish the artwork in the designer to continue.' : 'Do these designs look good? Would you like to publish them or make changes?';
  if (state.step === 'stores') return state.shopIds?.length ? 'Your stores are selected. Review the publication, or change the selection below.' : 'Which store should I publish your collection to?';
  return 'Review your collection below. Publishing requires your explicit confirmation.';
}
export function currentCatalog(conversation) {
  return [...conversation.messages].reverse().find(message => message.artifacts?.some(a => a.kind === 'catalog_page' || a.kind === 'product'))
    ?.artifacts.filter(a => a.kind === 'product' || a.kind === 'catalog_page').map(plain) || [];
}
export function swagTransitionMessages(state, input, conversation, mode) {
  const selection = input.addProductIds || input.removeProductIds;
  const catalog = selection ? currentCatalog(conversation) : [];
  const interaction = input.artworkProductIds || input.replaceArtwork !== undefined ? 'targets' : mode;
  const artworkPrompt = input.step === 'artwork' && (conversation.swag?.step || (conversation.swag?.name ? 'products' : 'name')) === 'products';
  const content = input.name !== undefined ? `Name the collection ${state.name}` : input.artworkAttachmentId ? `Upload ${state.artworkName || 'logo'}`
    : input.addProductIds ? `Add ${state.products.filter(p => input.addProductIds.includes(p.id)).map(p => p.name).join(', ')}`
      : input.removeProductIds ? 'Remove selected product'
        : input.artwork === 'none' ? 'Skip logo'
          : input.step === 'stores' ? 'Looks good'
            : input.step === 'review' ? 'Review for publication'
              : input.shopIds ? 'Update store selection'
                : interaction === 'targets' ? 'Choose products for my logo'
                  : mode === 'resume' ? 'Continue designing' : input.refreshSavedDesign ? 'Review updated saved design' : 'Continue';
  return [
    { role: 'user', content, uiEventId: `swag:action:${state.conversationId}:${state.revision}` },
    { role: 'assistant', content: swagGuidance(state, { named: input.name !== undefined, mode: interaction || (catalog.length ? 'gallery' : undefined) }),
      uiEventId: `swag:state:${state.conversationId}:${state.revision}`,
      artifacts: [...catalog, artworkPrompt ? swagArtworkPromptStep(state) : swagStep(state, interaction || (catalog.length ? 'gallery' : undefined))] },
  ];
}

/** Metadata-only recovery of a verified receipt. Stable IDs prevent duplicate
 * cards after a lost acknowledgement. Never calls PREPARE, EXECUTE or delivery. */
export async function appendSwagReceipt(conversation, outcome) {
  if (outcome.workflow !== 'swag.collection' || outcome.state !== 'completed' || !outcome.result) return;
  const eventId = `swag:receipt:${outcome.confirmationId}`;
  const latest = await CopilotConversation.findOne({ _id: conversation._id, tenantId: conversation.tenantId, userId: conversation.userId }).lean();
  if (!latest || latest.messages.some(m => m.uiEventId === eventId)) return;
  const result = outcome.result;
  const approvalRevision = latest.messages.flatMap(m => m.artifacts || []).find(a => a.confirmationId === outcome.confirmationId && a.request)?.request.revision;
  const sameOutcome = latest.swag?.lastOutcome?.id === result.id && latest.swag.lastOutcome.action === result.action
    && approvalRevision + 1 === latest.swag.revision;
  const state = latest.swag;
  const currentActive = state && !state.lastOutcome?.published;
  const content = !sameOutcome && currentActive ? `An earlier operation completed. Your current design choices are kept. ${swagGuidance(state)}` : result.published ? `Your ${result.name} collection publication is recorded below.`
    : result.action === 'apply' ? `${result.application?.targets?.length < result.productCount ? `Your logo has been applied to ${result.application.targets.length} selected product${result.application.targets.length === 1 ? '' : 's'}. Other products are unchanged.` : 'Your logo has been applied.'} Here's how your customized products look.`
      : `Your ${result.name} design is saved. You can continue whenever you’re ready.`;
  await CopilotConversation.updateOne({ _id: latest._id, tenantId: latest.tenantId, userId: latest.userId,
    'messages.uiEventId': { $ne: eventId }, ...(state ? { 'swag.revision': state.revision } : {}) }, { $push: { messages: {
      role: 'assistant', uiEventId: eventId, content, artifacts: [
        { kind: 'success', operation: 'swag.collection', confirmationId: outcome.confirmationId, status: 'completed', result, message: content },
        ...(currentActive ? [swagStep({ ...state, conversationId: String(latest._id) }, sameOutcome ? result.action === 'save' ? 'paused' : result.action === 'apply' ? 'applied' : undefined : undefined)] : []),
      ],
    } } });
}
export function browseEventId(state, query) {
  return `swag:browse:${state.conversationId}:${state.revision}:${createHash('sha256').update(JSON.stringify(query)).digest('hex').slice(0, 20)}`;
}
