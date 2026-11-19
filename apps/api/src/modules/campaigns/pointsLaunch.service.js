import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { Campaign } from './campaign.model.js';
import { Recipient } from './recipient.model.js';
import { Shop } from '../shops/shop.model.js';
import { Entity } from '../entities/entity.model.js';
import { WalletTransaction } from '../wallets/walletTransaction.model.js';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { recoveryHash } from '../../utils/recoveryHash.js';
import { ApiError } from '../../utils/errors.js';
import * as ledger from '../../services/ledger.service.js';
import { assertWalletCanSpend } from './campaigns.service.js';
import { assertCampaignSpendPayment } from '../payments/payments.service.js';
import { notify } from '../notifications/notifications.service.js';
import { Notification } from '../notifications/notification.model.js';
import { approvalConfig } from './pointsApprovalGuard.js';
import { transitionState } from '../../services/stateMachine.service.js';

const deliverySchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  approvalHash: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  payloadHash: { type: String, required: true },
  dueAt: { type: Date, required: true },
  state: { type: String, enum: ['ready', 'submitting', 'accepted', 'unresolved', 'blocked'], default: 'ready' },
  owner: { type: String, default: '' },
  claimedAt: Date,
  acceptedAt: Date,
  error: String,
  receipt: mongoose.Schema.Types.Mixed,
}, { timestamps: true });
deliverySchema.plugin(tenantScopePlugin);
deliverySchema.index({ tenantId: 1, campaignId: 1, recipientId: 1 }, { unique: true });
deliverySchema.index({ state: 1, dueAt: 1 });
export const PointsDelivery = mongoose.model('PointsDelivery', deliverySchema);
let deliveryIndexesReady;
const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };

export const lostLaunch = () => new ApiError(409, 'Launch ownership was lost', 'LAUNCH_LEASE_LOST');
export const changedLaunch = () => new ApiError(409, 'Launch details changed; review and confirm again', 'LAUNCH_MANIFEST_MISMATCH');
const reviewRequired = () => new ApiError(409, 'Historical launch needs explicit approval review before delivery', 'LAUNCH_REVIEW_REQUIRED');

export function recipientManifest(row) {
  return { id: String(row._id), campaignId: String(row.campaignId), name: row.name,
    email: row.email.trim().toLowerCase(), phone: row.phone || '', contactId: row.contactId ? String(row.contactId) : null,
    tokenHash: recoveryHash(row.redemptionToken) };
}

export async function pointsLaunchManifest(tenantId, campaignId, user, session = null) {
  const campaign = await Campaign.findOne({ tenantId, _id: campaignId }).session(session).lean();
  if (!campaign) throw changedLaunch();
  const config = approvalConfig(campaign);
  const entity = await Entity.findOne({ tenantId, _id: campaign.entityId }).session(session).lean();
  if (!entity) throw changedLaunch();
  const shop = campaign.shopId ? await Shop.findOne({ tenantId, _id: campaign.shopId }).session(session).lean() : null;
  if (campaign.shopId && !shop) throw changedLaunch();
  const recipients = await Recipient.find({ tenantId, campaignId }).sort({ _id: 1 }).session(session).lean();
  const manifest = { version: 1, config, funding: { entityId: String(entity._id), walletId: String(entity.walletId),
    scope: user.scopeType === 'entity' ? 'department_budget' : 'organization_unallocated' },
    store: shop ? { id: String(shop._id), name: shop.name, status: shop.status, currencyMode: shop.currencyMode,
      pointsConversionEnabled: shop.pointsConversionEnabled } : null,
    recipients: recipients.map(recipientManifest) };
  return { ...manifest, hash: recoveryHash(manifest) };
}

export function launchFence(campaign, lease) {
  return { tenantId: campaign.tenantId, _id: campaign._id, 'launchLease.owner': lease.owner,
    'launchLease.fence': lease.fence, 'launchLease.expiresAt': { $gt: new Date() } };
}
export async function fencePointsLaunch(campaign, lease, session) {
  const result = await Campaign.updateOne(launchFence(campaign, lease), { $inc: { deliveryRevision: 1 } }, { session });
  if (result.matchedCount !== 1) throw lostLaunch();
}

export function validatePointsDebit(debit, campaign, approval) {
  if (debit && (debit.type !== 'campaign_spend' || debit.amount !== -Math.round(campaign.totalBudget)
    || String(debit.walletId) !== approval.funding.walletId
    || String(debit.relatedEntityId || '') !== (approval.funding.scope === 'department_budget' ? String(campaign.entityId) : ''))) {
    throw new ApiError(409, 'Recorded debit differs from approved launch', 'LAUNCH_DEBIT_MISMATCH');
  }
}

// Financial writes, state and ready delivery intents commit together. This callback
// contains only MongoDB operations; transaction retries cannot submit notifications.
export async function commitPointsLaunch({ campaign, lease, user, expectedHash, payloadFor, paymentMode,
  razorpayOrderId, razorpayPaymentId, launchGuard }) {
  // Index/collection DDL must complete before any transaction reads the ledger.
  await ledger.ensureLedgerIndexes();
  deliveryIndexesReady ??= PointsDelivery.createIndexes();
  await deliveryIndexesReady;
  const session = await mongoose.startSession();
  let committed;
  try {
    await session.withTransaction(async () => {
      await fencePointsLaunch(campaign, lease, session);
      const current = await Campaign.findOne({ tenantId: campaign.tenantId, _id: campaign._id }).select('+launchApproval').session(session);
      if (launchGuard) await launchGuard(session, current);
      const approval = await pointsLaunchManifest(campaign.tenantId, campaign._id, user, session);
      if (expectedHash !== approval.hash || (current.launchApproval && current.launchApproval.hash !== approval.hash)) throw changedLaunch();
      // Funding reassignment and store conversion edits participate in the same
      // serialization boundary as the campaign and recipient identity writes.
      await Entity.updateOne({ tenantId: current.tenantId, _id: current.entityId }, { $inc: { __v: 1 } }, { session });
      if (current.shopId) await Shop.updateOne({ tenantId: current.tenantId, _id: current.shopId }, { $inc: { __v: 1 } }, { session });
      const launched = ['launched', 'redemption_open'].includes(current.status);
      if (!launched && current.status !== 'approved') throw new ApiError(422, 'Campaign must be approved before launch', 'CAMPAIGN_NOT_APPROVED');
      if (launched && !current.launchApproval) throw reviewRequired();
      if (current.schedule?.mode === 'scheduled' && !current.schedule.sendAt) throw new ApiError(422, 'Scheduled campaigns require sendAt', 'SCHEDULE_MISSING');
      const mode = ['upi', 'card'].includes(paymentMode) ? paymentMode : current.paymentMode || 'wallet';
      if (mode !== current.paymentMode) throw changedLaunch();
      const debit = await WalletTransaction.findOne({ tenantId: current.tenantId, idempotencyKey: `campaign_spend:${current._id}` }).session(session);
      validatePointsDebit(debit, current, approval);
      if (launched && mode === 'wallet' && current.totalBudget > 0 && !debit) throw new ApiError(409, 'Launch has no verified debit', 'LAUNCH_DEBIT_MISMATCH');
      if (!launched) {
        if (mode === 'wallet') {
          const { wallet } = await ledger.resolveSpendWalletForEntity({ tenantId: current.tenantId, entityId: current.entityId, session });
          if (!debit) await assertWalletCanSpend({ tenantId: current.tenantId, entityId: current.entityId, amount: current.totalBudget, user, session });
          if (current.totalBudget > 0) await ledger.createTransaction({ tenantId: current.tenantId, walletId: wallet._id,
            type: 'campaign_spend', amount: -Math.round(current.totalBudget),
            relatedEntityId: approval.funding.scope === 'department_budget' ? current.entityId : null,
            description: `Campaign launch: ${current.name}`, performedBy: user.userId,
            idempotencyKey: `campaign_spend:${current._id}` }, session);
        } else {
          await assertCampaignSpendPayment({ tenantId: current.tenantId, expectedAmountInr: current.totalBudget,
            razorpayOrderId, razorpayPaymentId: razorpayPaymentId || current.razorpayPaymentId, campaignId: current._id });
          current.razorpayPaymentId = razorpayPaymentId || current.razorpayPaymentId;
        }
        // Writes to each identity serialize a concurrent recipient mutation with
        // the snapshot used for approval/debit. Recheck before state persistence.
        await Recipient.updateMany({ tenantId: current.tenantId, campaignId: current._id },
          { $set: { launchIdentityHash: approval.hash } }, { session });
        if ((await pointsLaunchManifest(current.tenantId, current._id, user, session)).hash !== approval.hash) throw changedLaunch();
        current.launchApproval = approval;
        current.paymentMode = mode;
        transitionState('campaign', current, 'launched', { userId: user.userId });
        if (current.schedule?.mode !== 'scheduled') transitionState('campaign', current, 'redemption_open', { userId: user.userId });
        if (!current.isSample && current.schedule?.mode !== 'self') {
          const recipients = await Recipient.find({ tenantId: current.tenantId, campaignId: current._id }).session(session);
          for (const recipient of recipients) {
            const payload = payloadFor(recipient);
            await PointsDelivery.updateOne({ tenantId: current.tenantId, campaignId: current._id, recipientId: recipient._id },
              { $setOnInsert: { approvalHash: approval.hash, payload, payloadHash: recoveryHash(payload),
                dueAt: current.schedule?.mode === 'scheduled' ? current.schedule.sendAt : new Date(), state: 'ready' } }, { upsert: true, session });
          }
        }
        await fencePointsLaunch(current, lease, session);
        if (launchGuard) await launchGuard(session, current);
        current.$where = launchFence(current, lease);
        await current.save({ session });
      }
      current.$locals.didLaunch = !launched;
      committed = current;
    }, transactionOptions);
    committed.$session(null);
    return committed;
  } finally { await session.endSession(); }
}

// A delivery claim never expires or transfers. Once claimed, submission may have
// happened; no crash recovery path is permitted to submit that intent again.
export async function claimPointsDelivery(job, lease = null) {
  const session = await mongoose.startSession();
  let claimed = null;
  try {
    await session.withTransaction(async () => {
      claimed = null;
      const campaign = await Campaign.findOne({ tenantId: job.tenantId, _id: job.campaignId }).select('+launchApproval').session(session);
      if (!campaign?.launchApproval) throw reviewRequired();
      if (!['launched', 'redemption_open'].includes(campaign.status)) throw changedLaunch();
      if (lease) await fencePointsLaunch(campaign, lease, session);
      else await Campaign.updateOne({ tenantId: job.tenantId, _id: job.campaignId }, { $inc: { deliveryRevision: 1 } }, { session });
      const user = { scopeType: campaign.launchApproval.funding.scope === 'department_budget' ? 'entity' : 'tenant' };
      const manifest = await pointsLaunchManifest(job.tenantId, job.campaignId, user, session);
      if (manifest.hash !== campaign.launchApproval.hash || manifest.hash !== job.approvalHash) throw changedLaunch();
      await ledger.resolveSpendWalletForEntity({ tenantId: job.tenantId, entityId: campaign.entityId, session });
      const debit = await WalletTransaction.findOne({ tenantId: job.tenantId, idempotencyKey: `campaign_spend:${campaign._id}` }).session(session);
      validatePointsDebit(debit, campaign, manifest);
      if (campaign.paymentMode === 'wallet' && campaign.totalBudget > 0 && !debit) throw new ApiError(409, 'Launch has no verified debit', 'LAUNCH_DEBIT_MISMATCH');
      const expected = manifest.recipients.find(row => row.id === String(job.recipientId));
      if (!expected || recoveryHash(job.payload) !== job.payloadHash || job.payload.email !== expected.email
        || String(job.payload.tenantId) !== String(job.tenantId)
        || job.payload.link !== `/redeem/${(await Recipient.findOne({ tenantId: job.tenantId, _id: job.recipientId }).session(session))?.redemptionToken}`) throw changedLaunch();
      const owner = randomBytes(16).toString('hex');
      claimed = await PointsDelivery.findOneAndUpdate({ tenantId: job.tenantId, _id: job._id, state: 'ready',
        approvalHash: manifest.hash, dueAt: { $lte: new Date() } },
      { $set: { state: 'submitting', owner, claimedAt: new Date() } }, { session, returnDocument: 'after' });
      if (!claimed) return;
      if (campaign.schedule?.mode === 'scheduled' && !campaign.schedule.pointsCreditedAt) {
        await Recipient.updateMany({ tenantId: job.tenantId, campaignId: job.campaignId },
          { $set: { creditAmount: campaign.creditsPerRecipient } }, { session });
        await Campaign.updateOne({ tenantId: job.tenantId, _id: job.campaignId },
          { $set: { 'schedule.pointsCreditedAt': new Date() } }, { session });
      }
      const recipient = await Recipient.findOneAndUpdate({ tenantId: job.tenantId, _id: job.recipientId, campaignId: job.campaignId,
        name: expected.name, email: expected.email, invitedAt: null, inviteClaimedAt: null },
      { $set: { inviteClaimedAt: claimed.claimedAt } }, { session, returnDocument: 'after' });
      if (!recipient) {
        await PointsDelivery.updateOne({ tenantId: job.tenantId, _id: job._id, owner }, { $set: { state: 'unresolved', error: 'Existing invitation claim' } }, { session });
        claimed = null;
      }
    }, transactionOptions);
    return claimed;
  } finally { await session.endSession(); }
}

export async function submitPointsDelivery(claimed) {
  // Reload the durable immutable payload and permanent owner; a caller cannot
  // substitute a recipient or regain a consumed claim by passing a stale object.
  const job = await PointsDelivery.findOne({ tenantId: claimed.tenantId, _id: claimed._id, owner: claimed.owner, state: 'submitting' });
  if (!job) return false;
  if (recoveryHash(job.payload) !== job.payloadHash) throw changedLaunch();
  // Single atomic permit consumed BEFORE external I/O. Unknown outcomes are final
  // for automatic dispatch, including process death before/after this write.
  const permit = await PointsDelivery.updateOne({ tenantId: job.tenantId, _id: job._id, owner: job.owner, state: 'submitting' },
    { $set: { state: 'unresolved', error: 'Submission acknowledgement pending' } }, { writeConcern: { w: 'majority' } });
  if (permit.modifiedCount !== 1) return false;
  try {
    const acknowledgement = await notify(job.payload, { durableInvitation: true });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await PointsDelivery.updateOne({ tenantId: job.tenantId, _id: job._id, owner: job.owner, state: 'unresolved' },
          { $set: { state: 'accepted', acceptedAt: new Date(), error: '',
            receipt: { provider: acknowledgement?.provider, messageId: acknowledgement?.messageId } } }, { session });
        const marked = await Recipient.updateOne({ tenantId: job.tenantId, _id: job.recipientId, inviteClaimedAt: job.claimedAt },
          { $set: { invitedAt: new Date() } }, { session });
        if (marked.matchedCount !== 1) throw changedLaunch();
      }, transactionOptions);
    } finally { await session.endSession(); }
    return true;
  } catch {
    // No queue fallback, no lease takeover, no automatic resend.
    return false;
  }
}

export async function dispatchPointsDeliveries({ tenantId, campaignId, lease = null, limit = 100 }) {
  const jobs = await PointsDelivery.find({ tenantId, campaignId, state: 'ready', dueAt: { $lte: new Date() } }).limit(limit);
  for (const job of jobs) {
    const claimed = await claimPointsDelivery(job, lease);
    if (claimed) await submitPointsDelivery(claimed);
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const campaign = await Campaign.findOne({ tenantId, _id: campaignId }).select('+launchApproval').session(session);
      if (!campaign || !['launched', 'redemption_open'].includes(campaign.status)) throw changedLaunch();
      if (!campaign.launchApproval) throw reviewRequired();
      if (lease) await fencePointsLaunch(campaign, lease, session);
      else await Campaign.updateOne({ tenantId, _id: campaignId }, { $inc: { deliveryRevision: 1 } }, { session });
      const remaining = await PointsDelivery.countDocuments({ tenantId, campaignId, state: { $ne: 'accepted' } }).session(session);
      const accepted = await PointsDelivery.countDocuments({ tenantId, campaignId, state: 'accepted' }).session(session);
      const update = { 'schedule.invitesUnresolved': remaining > 0 };
      if (!remaining) {
        update['schedule.invitesSentAt'] = campaign.schedule?.invitesSentAt || new Date();
        if (campaign.status === 'launched') update.status = 'redemption_open';
      }
      if (accepted > 0 && !campaign.schedule?.launchNoticeAt) {
        const entity = await Entity.findOne({ tenantId, _id: campaign.entityId }).session(session);
        if (entity?.managerUserId) {
          await Notification.create([{ tenantId, userId: entity.managerUserId, type: 'campaign_launched',
            title: `Campaign launched: ${campaign.name}`, body: `${accepted} invitation submissions accepted.`,
            link: `/campaigns/${campaignId}` }], { session });
        }
        update['schedule.launchNoticeAt'] = new Date();
      }
      await Campaign.updateOne({ tenantId, _id: campaignId }, { $set: update }, { session });
    }, transactionOptions);
  } finally { await session.endSession(); }
  return Campaign.findOne({ tenantId, _id: campaignId });
}

export async function recoverPointsDeliveries({ limit = 50 } = {}) {
  const jobs = await PointsDelivery.find({ state: 'ready', dueAt: { $lte: new Date() } }).setOptions({ skipTenantGuard: true }).limit(limit).lean();
  const groups = new Map(jobs.map(job => [`${job.tenantId}:${job.campaignId}`, job]));
  // Also finish markers/manager notices after a crash following provider ACK.
  // Submitting/unresolved jobs are observed, never reclaimed or resubmitted.
  const unfinished = await Campaign.find({ type: 'points', status: { $in: ['launched', 'redemption_open'] },
    'launchApproval.hash': { $exists: true }, 'schedule.invitesSentAt': null,
    $or: [{ 'schedule.mode': 'now' }, { 'schedule.mode': 'scheduled', 'schedule.sendAt': { $lte: new Date() } }] })
    .setOptions({ skipTenantGuard: true }).select('tenantId').limit(limit).lean();
  for (const row of unfinished) groups.set(`${row.tenantId}:${row._id}`, { tenantId: row.tenantId, campaignId: row._id });
  for (const job of groups.values()) {
    try { await dispatchPointsDeliveries({ tenantId: job.tenantId, campaignId: job.campaignId, limit }); }
    catch (error) {
      if (['LAUNCH_MANIFEST_MISMATCH', 'LAUNCH_REVIEW_REQUIRED'].includes(error.code)) {
        await PointsDelivery.updateMany({ tenantId: job.tenantId, campaignId: job.campaignId, state: 'ready' },
          { $set: { state: 'blocked', error: error.code } });
        await Campaign.updateOne({ tenantId: job.tenantId, _id: job.campaignId }, { $set: { 'schedule.invitesUnresolved': true } });
      } else throw error;
    }
  }
}
