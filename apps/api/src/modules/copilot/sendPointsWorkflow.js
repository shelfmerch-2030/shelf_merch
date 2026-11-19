import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Campaign } from '../campaigns/campaign.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { Entity } from '../entities/entity.model.js';
import { Contact } from '../contacts/contact.model.js';
import { Shop } from '../shops/shop.model.js';
import { WalletTransaction } from '../wallets/walletTransaction.model.js';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { ApiError } from '../../utils/errors.js';
import { recoveryHash } from '../../utils/recoveryHash.js';
import * as ledger from '../../services/ledger.service.js';
import { visibleFunds } from '../mcp/walletVisibility.js';
import { pointsPresentation } from '../mcp/pointsPresentation.js';
import { employeeReaderFromContext } from '../mcp/employeesRead.js';
import { campaignsPreparePointsDraftInputSchema, planNewPointsDraft, saveReservedPointsDraft } from '../mcp/campaignsDraftWrite.js';
import { captureDraftProof, proveDraft } from '../mcp/pointsDraftRecovery.js';
import { McpWriteConfirmation } from '../mcp/mcpWriteConfirmation.model.js';
import { prepareMcpWrite, executeMcpWrite, loadMcpActor } from '../mcp/mcpWriteSafety.js';
import { allocateCredits, inspectCreditAllocationRecovery, launchCampaign } from '../campaigns/campaigns.service.js';
import { allocationStateHash } from '../campaigns/allocationRecovery.js';
import { CampaignOperation } from '../campaigns/campaignOperation.js';
import { approvalConfig } from '../campaigns/pointsApprovalGuard.js';
import { pointsLaunchManifest, validatePointsDebit, PointsDelivery } from '../campaigns/pointsLaunch.service.js';

export const SEND_POINTS_OPERATION = 'campaigns.send_points';
export const sendPointsPrepareSchema = campaignsPreparePointsDraftInputSchema.safeExtend({
  pointsPerRecipient: z.number().int().positive().optional().describe('Displayed store units. For a points store 500 Points = INR250; INR stores use 1 Credit = INR1. Supply either this or creditsPerRecipient (INR), never both.'),
}).superRefine((value, ctx) => {
  if (value.campaignId) ctx.addIssue({ code: 'custom', message: 'Use the existing campaign workflow', path: ['campaignId'] });
  if ((value.pointsPerRecipient == null) === (value.creditsPerRecipient == null)) ctx.addIssue({ code: 'custom', message: 'Specify one per-recipient amount', path: ['pointsPerRecipient'] });
  if (!value.recipients?.length) ctx.addIssue({ code: 'custom', message: 'Resolve the recipient list first', path: ['recipients'] });
});
export const sendPointsExecuteSchema = sendPointsPrepareSchema.safeExtend({
  confirmationId: z.string().min(20).max(200), idempotencyKey: z.string().min(8).max(200),
});
export const SEND_POINTS_DESCRIPTION = 'Default for a NEW ordinary Send Points request: resolve the store, exact people and authorized funding, then prepare ONE final Confirm & Send Points card. No campaign or financial writes occur in PREPARE. Pass contactId from employees_search, or name/email supplied by the user. Ask only for missing/ambiguous details. pointsPerRecipient is displayed store units (500 Points = INR250 in a points store); creditsPerRecipient is INR. Minimum whole INR250. Existing campaigns must use their supported draft/allocation/launch workflows; never recreate them. Explicit save-draft or allocate-only requests retain the staged tools. Execute is confirmation-UI only.';

const journalSchema = new mongoose.Schema({
  actorUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  confirmationId: { type: String, required: true },
  logicalKey: { type: String, required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, required: true },
  plan: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  phase: { type: String, default: 'draft_pending' },
  allocationBefore: String, launchHash: String,
  owner: String, fence: { type: Number, default: 1 }, leaseExpiresAt: Date, approvalExpiresAt: Date,
  revision: { type: Number, default: 0 },
  verified: { draft: Date, allocation: Date, launch: Date },
  result: mongoose.Schema.Types.Mixed,
}, { timestamps: true, writeConcern: { w: 'majority' } });
journalSchema.plugin(tenantScopePlugin);
journalSchema.index({ tenantId: 1, actorUserId: 1, confirmationId: 1 }, { unique: true });
journalSchema.index({ tenantId: 1, logicalKey: 1 }, { unique: true });
export const SendPointsOperation = mongoose.model('SendPointsOperation', journalSchema);
let indexesReady;
const duplicate = error => error?.code === 11000 || error?.cause?.code === 11000;
const review = () => new ApiError(409, 'This confirmed send requires review; do not create another campaign or retry uncertain invitations', 'SEND_POINTS_REVIEW_REQUIRED');
const normalizedName = value => String(value).trim().toLowerCase().replace(/\s+/g, ' ');
const identity = row => ({ name: row.name, email: row.email.trim().toLowerCase(), phone: row.phone || '', contactId: row.contactId ? String(row.contactId) : null });
const sorted = rows => rows.map(identity).sort((a, b) => a.email.localeCompare(b.email));
const actorBinding = actor => ({ role: actor.user.role, scope: actor.user.scopeType,
  scopeId: actor.user.scopeId ? String(actor.user.scopeId) : null, assigned: [...actor.user.assignedEntityIds].map(String).sort() });
function requestOf(input) {
  const { confirmationId, idempotencyKey, ...request } = input;
  return sendPointsPrepareSchema.parse(request);
}

async function planSend(tenantId, actor, request, approved = null, ownCampaignId = null) {
  const shop = await Shop.findOne({ tenantId, _id: request.shopId });
  if (!shop) throw new ApiError(404, 'Store not found', 'NOT_FOUND');
  const amount = request.pointsPerRecipient == null ? request.creditsPerRecipient
    : request.pointsPerRecipient / (shop.currencyMode === 'points' ? 2 : 1);
  if (!Number.isInteger(amount) || amount < 250) throw new ApiError(422, 'Use a whole INR amount of at least INR250 per recipient', 'BUDGET_TOO_LOW');
  const draft = await planNewPointsDraft({ tenantId, actor, input: { ...request, creditsPerRecipient: amount } });
  // The shared draft saver links existing Contacts by email when no id was
  // supplied. Resolve that same binding before approval, rather than discovering
  // an additional identity while saving the confirmed manifest.
  const implicit = await Contact.find({ tenantId, email: { $in: draft.resolvedRecipients.filter(row => !row.contactId).map(row => row.email) } }).select('_id email');
  for (const row of draft.resolvedRecipients) {
    const contact = !row.contactId && implicit.find(value => value.email === row.email);
    if (contact) row.contactId = String(contact._id);
  }
  if (draft.resolvedRecipients.length !== request.recipients.length) throw new ApiError(422, 'Recipients contain duplicate identities; review the list', 'RECIPIENT_DUPLICATE');
  if (draft.schedule?.mode === 'scheduled' && !draft.schedule.sendAt) throw new ApiError(422, 'Choose a scheduled send time', 'SCHEDULE_MISSING');
  const wallet = request.entityId ? (await ledger.resolveSpendWalletForEntity({ tenantId, entityId: request.entityId })).wallet
    : await ledger.requireWalletForFinancialWrite({ tenantId, walletId: request.walletId });
  const entity = draft.resolvedEntityId ? await Entity.findOne({ tenantId, _id: draft.resolvedEntityId }) : null;
  const department = actor.user.scopeType === 'entity';
  const funds = await visibleFunds(actor.user, tenantId, entity?._id, { balance: wallet.balance, unallocatedAmount: wallet.balance - wallet.allocatedAmount });
  const total = amount * draft.resolvedRecipients.length;
  if (funds.unallocatedAmount < total) throw new ApiError(422, 'Insufficient available funding', department ? 'INSUFFICIENT_ENTITY_BUDGET' : 'INSUFFICIENT_FUNDS');
  const existing = await Campaign.find({ tenantId, type: 'points',
    ...(actor.user.scopeType === 'entity' ? { entityId: { $in: actor.user.assignedEntityIds } } : {}) }).select('name status');
  const conflict = existing.find(row => String(row._id) !== String(ownCampaignId || '') && normalizedName(row.name) === normalizedName(request.name));
  if (conflict) throw new ApiError(409, `Campaign "${conflict.name}" already exists (${conflict.status}); use its existing campaign workflow`, 'CAMPAIGN_ALREADY_EXISTS');
  const schedule = { mode: draft.schedule?.mode || 'now', sendAt: draft.schedule?.sendAt ? new Date(draft.schedule.sendAt).toISOString() : null,
    timezone: draft.schedule?.timezone || 'Asia/Kolkata' };
  const resources = { recipients: sorted(draft.resolvedRecipients),
    store: { id: String(shop._id), name: shop.name, status: shop.status, currencyMode: shop.currencyMode, pointsConversionEnabled: shop.pointsConversionEnabled },
    funding: { walletId: String(wallet._id), entityId: approved?.resources.funding.entityId === null && !request.entityId ? null : draft.resolvedEntityId || null,
      scope: department ? 'department_budget' : 'organization_unallocated' },
    funds: { balance: wallet.balance, allocated: wallet.allocatedAmount, entityAllocated: department ? entity?.allocatedAmount : null, entitySpent: department ? entity?.spentAmount : null },
    actor: actorBinding(actor),
    config: { name: draft.name, shopId: String(shop._id), pointsScope: draft.pointsScope, amount, total,
      message: { from: draft.message?.from || '', body: draft.message?.body || '' }, schedule } };
  const presentation = pointsPresentation({ shop, pointsScope: draft.pointsScope, funds, wallet, entity });
  const preview = { ...presentation, name: draft.name, campaignName: draft.name, recipientCount: resources.recipients.length,
    recipientIdentities: resources.recipients.map(({ name, email }) => ({ name, email })), creditsPerRecipient: amount, totalBudget: total,
    deliveryMode: schedule.mode, sendAt: schedule.sendAt, timezone: schedule.timezone,
    walletImpact: { debitedNow: total, balanceBefore: funds.balance, balanceAfter: funds.balance - total,
      unallocatedBefore: funds.unallocatedAmount, unallocatedAfter: funds.unallocatedAmount - total },
    combined: true };
  return { draft, resources, preview };
}

async function projection(journal, actor, session = null) {
  const campaign = await Campaign.findOne({ tenantId: journal.tenantId, _id: journal.campaignId }).select('+launchApproval').session(session);
  if (!campaign) throw review();
  const plan = journal.plan;
  const entity = await Entity.findOne({ tenantId: journal.tenantId, _id: campaign.entityId }).session(session);
  if (!entity || String(entity.walletId) !== plan.resources.funding.walletId
    || (plan.resources.funding.entityId && String(entity._id) !== plan.resources.funding.entityId)) throw review();
  const expected = new Campaign({ tenantId: journal.tenantId, entityId: entity._id, createdBy: journal.actorUserId,
    type: 'points', shopId: plan.draft.shopId, name: plan.draft.name, pointsScope: plan.draft.pointsScope,
    creditsPerRecipient: plan.resources.config.amount, recipientCount: plan.resources.recipients.length,
    totalBudget: plan.resources.config.total, message: plan.resources.config.message, schedule: plan.resources.config.schedule });
  if (recoveryHash(approvalConfig(expected.toObject())) !== recoveryHash(approvalConfig(campaign.toObject()))) throw review();
  const rows = await Recipient.find({ tenantId: journal.tenantId, campaignId: campaign._id }).session(session).lean();
  if (recoveryHash(sorted(rows)) !== recoveryHash(plan.resources.recipients)) throw review();
  if (campaign.status === 'approved' && rows.some(row => row.creditAmount !== (campaign.schedule?.mode === 'scheduled' ? 0 : plan.resources.config.amount))) throw review();
  const manifest = await pointsLaunchManifest(journal.tenantId, campaign._id, actor.user, session);
  if (recoveryHash(manifest.store) !== recoveryHash(plan.resources.store)) throw review();
  return campaign;
}

async function facts(journal, actor) {
  const campaign = await Campaign.findOne({ tenantId: journal.tenantId, _id: journal.campaignId }).select('+launchApproval');
  const debit = await WalletTransaction.findOne({ tenantId: journal.tenantId, idempotencyKey: `campaign_spend:${journal.campaignId}` });
  if (campaign && debit) validatePointsDebit(debit, campaign, { funding: journal.plan.resources.funding });
  const launched = Boolean(journal.launchHash && campaign?.launchApproval?.hash === journal.launchHash
    && ['launched', 'redemption_open', 'redemption_closed', 'fulfilled'].includes(campaign.status));
  if (launched) validatePointsDebit(debit, campaign, campaign.launchApproval);
  if (launched && campaign.totalBudget > 0 && !debit) throw review();
  const accepted = await PointsDelivery.countDocuments({ tenantId: journal.tenantId, campaignId: journal.campaignId, state: 'accepted' });
  const unresolved = await PointsDelivery.countDocuments({ tenantId: journal.tenantId, campaignId: journal.campaignId, state: { $in: ['submitting', 'unresolved', 'blocked'] } });
  const ready = await PointsDelivery.countDocuments({ tenantId: journal.tenantId, campaignId: journal.campaignId, state: 'ready' });
  const savedRecipientCount = await Recipient.countDocuments({ tenantId: journal.tenantId, campaignId: journal.campaignId });
  const mode = journal.plan.resources.config.schedule.mode;
  const wallet = await ledger.requireWalletForFinancialWrite({ tenantId: journal.tenantId, walletId: journal.plan.resources.funding.walletId }).catch(() => null);
  const entity = campaign && await Entity.findOne({ tenantId: journal.tenantId, _id: campaign.entityId });
  const balance = wallet ? await visibleFunds(actor.user, journal.tenantId, entity?._id,
    { balance: wallet.balance, unallocatedAmount: wallet.balance - wallet.allocatedAmount }) : null;
  const { recipientIdentities, walletImpact, ...publicPreview } = journal.plan.preview;
  return { ...publicPreview, id: String(journal.campaignId), campaignId: String(journal.campaignId),
    status: campaign?.status || 'not_created', outcome: launched ? 'completed' : 'recovery_required',
    walletDebited: Boolean(debit), ...(debit ? { debitedAmountInr: Math.abs(debit.amount) } : {}),
    ...(balance ? { balance: balance.balance, unallocatedAmount: balance.unallocatedAmount } : {}),
    savedRecipientCount, invitationsSent: accepted, invitationsAcknowledged: accepted, invitationsUnresolved: unresolved > 0,
    invitationStatus: unresolved ? 'unresolved' : !launched ? 'requires_review' : mode === 'self' ? 'self_share'
      : ready ? mode === 'scheduled' && campaign.schedule.sendAt > new Date() ? 'scheduled' : 'pending' : 'acknowledged',
    progress: { draft: Boolean(journal.verified?.draft), allocation: Boolean(journal.verified?.allocation), launch: launched },
  };
}

function ownerFilter(journal) {
  return { tenantId: journal.tenantId, _id: journal._id, owner: journal.owner, fence: journal.fence,
    leaseExpiresAt: { $gt: new Date() }, approvalExpiresAt: { $gt: new Date() } };
}
async function stage(journal, fields, session = null) {
  const result = await SendPointsOperation.updateOne(ownerFilter(journal), { $set: fields, $inc: { revision: 1 } }, { session });
  if (result.matchedCount !== 1) throw new ApiError(409, 'Confirmed-send ownership or approval was lost', 'SEND_POINTS_LEASE_LOST');
}
async function authorizedActor(journal, session = null) {
  const actor = await loadMcpActor({ tenantId: journal.tenantId, actorUserId: journal.actorUserId, session });
  if (recoveryHash(actorBinding(actor)) !== recoveryHash(journal.plan.resources.actor)) throw new ApiError(403, 'Funding authorization changed; review this send', 'FORBIDDEN');
  return actor;
}
async function allocationDecision(journal, actor) {
  const input = { tenantId: journal.tenantId, campaignId: journal.campaignId, user: actor.user,
    creditsPerRecipient: journal.plan.resources.config.amount, idempotencyKey: `send:${journal._id}:allocate` };
  const receipt = await CampaignOperation.findOne({ tenantId: journal.tenantId, key: input.idempotencyKey, operation: 'allocate_credits' });
  if (!receipt) return { input, outcome: journal.allocationBefore && await allocationStateHash(input) === journal.allocationBefore ? 'absent' : 'uncertain' };
  return { input, ...await inspectCreditAllocationRecovery(input) };
}
async function safeResume(journal, actor) {
  if (journal.owner && journal.leaseExpiresAt > new Date()) return false;
  if (journal.phase === 'review_required') return false;
  const campaign = await Campaign.findOne({ tenantId: journal.tenantId, _id: journal.campaignId });
  if (!campaign) return journal.phase === 'draft_pending';
  if (!journal.allocationBefore) return proveDraft(journal.tenantId, journal.plan.draft, journal.plan.draftProof, campaign);
  const decision = await allocationDecision(journal, actor);
  if (decision.outcome === 'completed') { await projection(journal, actor); return true; }
  return decision.outcome === 'absent';
}

export async function prepareSendPoints({ tenantId, actorUserId, input, now }) {
  const request = requestOf(input); let plan;
  const result = await prepareMcpWrite({ tenantId, actorUserId, operation: SEND_POINTS_OPERATION, payload: request, now,
    authorize: async actor => { plan = await planSend(tenantId, actor, request); },
    resourceState: async () => plan.resources,
    recoveryProof: async () => ({ version: 1, ...plan, draftProof: await captureDraftProof(tenantId, actorUserId, plan.draft, null) }),
  });
  return { confirmationId: result.confirmationId, expiresAt: result.expiresAt, preview: plan.preview };
}

async function runSend(context, actor, approved) {
  const { tenantId, actorUserId, confirmationId } = context;
  indexesReady ??= SendPointsOperation.createIndexes(); await indexesReady;
  let journal = await SendPointsOperation.findOne({ tenantId, actorUserId, confirmationId }).select('+plan');
  const owner = randomBytes(16).toString('hex');
  if (!journal) {
    try { journal = await SendPointsOperation.create({ tenantId, actorUserId, confirmationId, logicalKey: approved.draft.logicalKey,
      campaignId: new mongoose.Types.ObjectId(), plan: approved, owner, fence: 1,
      leaseExpiresAt: new Date(Date.now() + 30000), approvalExpiresAt: context.expiresAt }); }
    catch (error) { if (duplicate(error)) throw new ApiError(409, 'This send already has an operation; resolve its original confirmation', 'SEND_POINTS_IN_PROGRESS'); throw error; }
  } else {
    journal = await SendPointsOperation.findOneAndUpdate({ tenantId, _id: journal._id, fence: journal.fence,
      $or: [{ owner: '' }, { leaseExpiresAt: { $lte: new Date() } }] },
    { $set: { owner, leaseExpiresAt: new Date(Date.now() + 30000) }, $inc: { fence: 1 } }, { returnDocument: 'after' }).select('+plan');
    if (!journal) throw new ApiError(409, 'This send is already running', 'SEND_POINTS_IN_PROGRESS');
  }
  const heartbeat = setInterval(() => {
    SendPointsOperation.updateOne(ownerFilter(journal), { $set: { leaseExpiresAt: new Date(Date.now() + 30000) } }).catch(() => {});
  }, 10000); heartbeat.unref?.();
  try {
    await stage(journal, {});
    actor = await authorizedActor(journal);
    let campaign = await Campaign.findOne({ tenantId, _id: journal.campaignId });
    if (!journal.allocationBefore) {
      if (!campaign) {
        await saveReservedPointsDraft({ tenantId, actor, input: structuredClone(journal.plan.draft), campaignId: journal.campaignId });
        campaign = await Campaign.findOne({ tenantId, _id: journal.campaignId });
      }
      if (!await proveDraft(tenantId, journal.plan.draft, journal.plan.draftProof, campaign)) throw review();
      const before = await allocationStateHash({ tenantId, campaignId: journal.campaignId });
      await stage(journal, { phase: 'allocation_pending', 'verified.draft': new Date(), allocationBefore: before });
      journal.allocationBefore = before;
    }
    const decision = await allocationDecision(journal, actor);
    actor = await authorizedActor(journal);
    if (decision.outcome === 'absent') await allocateCredits({ ...decision.input, confirmedStateHash: journal.allocationBefore });
    else if (decision.outcome !== 'completed') throw review();
    await projection(journal, actor);
    await stage(journal, { phase: 'launch_pending', 'verified.allocation': new Date() });
    const launchHash = (await pointsLaunchManifest(tenantId, journal.campaignId, actor.user)).hash;
    if (journal.launchHash && journal.launchHash !== launchHash) throw review();
    await stage(journal, { launchHash }); journal.launchHash = launchHash;
    await launchCampaign({ tenantId, campaignId: journal.campaignId, user: actor.user, expectedLaunchHash: launchHash,
      launchGuard: async (session, current) => {
        await stage(journal, { phase: 'launch_pending' }, session);
        await authorizedActor(journal, session);
        await projection(journal, actor, session);
        if (current.status === 'approved') {
          const wallet = await ledger.requireWalletForFinancialWrite({ tenantId, walletId: journal.plan.resources.funding.walletId, session });
          const entity = await Entity.findOne({ tenantId, _id: current.entityId }).session(session);
          const before = journal.plan.resources.funds;
          if (wallet.balance !== before.balance || wallet.allocatedAmount !== before.allocated
            || (actor.user.scopeType === 'entity' && (entity.allocatedAmount !== before.entityAllocated || entity.spentAmount !== before.entitySpent))) throw review();
        }
      } });
    journal.verified = { draft: new Date(), allocation: new Date(), launch: new Date() };
    const result = await facts(journal, actor);
    if (result.outcome !== 'completed') throw review();
    await stage(journal, { phase: 'completed', verified: journal.verified, result });
    return result;
  } catch (error) {
    if (error.code === 'SEND_POINTS_REVIEW_REQUIRED') await stage(journal, { phase: 'review_required' }).catch(() => {});
    throw error;
  } finally {
    clearInterval(heartbeat);
    await SendPointsOperation.updateOne({ tenantId, _id: journal._id, owner: journal.owner, fence: journal.fence },
      { $set: { owner: '', leaseExpiresAt: new Date(0) } });
  }
}

export async function executeSendPoints({ tenantId, actorUserId, input, confirmationId, idempotencyKey, now }) {
  const request = requestOf(input);
  const confirmation = await McpWriteConfirmation.findOne({ tenantId, actorUserId, operation: SEND_POINTS_OPERATION, confirmationId }).select('recoveryProof expiresAt');
  const approved = confirmation?.recoveryProof;
  let plan;
  return executeMcpWrite({ tenantId, actorUserId, operation: SEND_POINTS_OPERATION, payload: request, confirmationId, idempotencyKey, now,
    allowProvenResume: true,
    authorize: async actor => {
      if (approved?.version !== 1) throw new ApiError(409, 'Prepare a fresh send preview', 'CONFIRMATION_STALE');
      const own = await SendPointsOperation.findOne({ tenantId, actorUserId, confirmationId }).select('campaignId');
      plan = await planSend(tenantId, actor, request, approved, own?.campaignId);
    },
    resourceState: async actor => {
      const own = await SendPointsOperation.findOne({ tenantId, actorUserId, confirmationId }).select('campaignId');
      plan = await planSend(tenantId, actor, request, approved, own?.campaignId);
      return plan.resources;
    },
    execute: actor => runSend({ tenantId, actorUserId, confirmationId, expiresAt: confirmation.expiresAt }, actor, approved),
    reconcile: async actor => {
      const journal = await SendPointsOperation.findOne({ tenantId, actorUserId, confirmationId }).select('+plan');
      if (!journal) return { outcome: 'absent' };
      const result = await facts(journal, actor);
      if (result.outcome === 'completed') return { outcome: 'completed', result };
      return { outcome: await safeResume(journal, actor) ? 'absent' : 'uncertain' };
    },
  }).catch(async error => {
    const outcome = await readSendPointsOutcome({ tenantId, actorUserId, confirmationId }).catch(() => null);
    if (outcome?.progress) error.details = { outcome: outcome.state, progress: outcome.progress, canResume: outcome.canResume };
    throw error;
  });
}

export async function readSendPointsOutcome({ tenantId, actorUserId, confirmationId }) {
  const journal = await SendPointsOperation.findOne({ tenantId, actorUserId, confirmationId }).select('+plan');
  if (!journal) return null;
  const actor = await loadMcpActor({ tenantId, actorUserId });
  const result = journal.phase === 'completed' && journal.result ? journal.result : await facts(journal, actor);
  if (result.outcome === 'completed') return { state: 'completed', result };
  if (journal.owner && journal.leaseExpiresAt > new Date()) return { state: 'consumed',
    progress: { ...result, outcome: 'in_progress' }, canResume: false, errorCode: 'SEND_POINTS_IN_PROGRESS' };
  let canResume = false;
  try {
    canResume = journal.approvalExpiresAt > new Date() && await safeResume(journal, actor);
    if (canResume) {
      const source = { ...journal.plan.draft, ...(journal.plan.draft.schedule ? { schedule: {
        ...journal.plan.draft.schedule, ...(journal.plan.draft.schedule.sendAt ? { sendAt: new Date(journal.plan.draft.schedule.sendAt).toISOString() } : {}),
      } } : {}) };
      const current = await planSend(tenantId, actor, source, journal.plan, journal.campaignId);
      canResume = recoveryHash(current.resources) === recoveryHash(journal.plan.resources);
    }
  } catch { /* No speculative recovery. */ }
  return { state: 'failed', progress: { ...result, outcome: canResume ? 'partial' : 'recovery_required' }, canResume,
    errorCode: canResume ? 'SEND_POINTS_RESUMABLE' : 'SEND_POINTS_REVIEW_REQUIRED' };
}

function caller(ctx) {
  const value = employeeReaderFromContext(ctx);
  if (!value.tenantId || !value.user.userId) throw new ApiError(403, 'Send Points is unavailable', 'FORBIDDEN');
  return { tenantId: value.tenantId, actorUserId: value.user.userId };
}
export const prepareSendPointsForCaller = (ctx, args) => prepareSendPoints({ ...caller(ctx), input: args });
export const executeSendPointsForCaller = (ctx, args) => executeSendPoints({ ...caller(ctx), input: args,
  confirmationId: args.confirmationId, idempotencyKey: args.idempotencyKey });
