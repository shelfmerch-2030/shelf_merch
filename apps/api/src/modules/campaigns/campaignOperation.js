import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { ApiError } from '../../utils/errors.js';

const LEASE_MS = 30 * 1000;

const campaignOperationSchema = new mongoose.Schema(
  {
    operation: { type: String, required: true },
    key: { type: String, required: true },
    fingerprint: { type: String, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    errorCode: { type: String, default: '' },
    leaseOwner: { type: String, default: '' },
    leaseExpiresAt: { type: Date, default: null },
    fence: { type: Number, default: 0 },
    recoveryProof: { type: mongoose.Schema.Types.Mixed, default: null },
    retryable: { type: Boolean, default: false },
  },
  { timestamps: true },
);

campaignOperationSchema.plugin(tenantScopePlugin);
campaignOperationSchema.index({ tenantId: 1, operation: 1, key: 1 }, { unique: true });

export const CampaignOperation = mongoose.model('CampaignOperation', campaignOperationSchema);

function inFlight() {
  return new ApiError(409, 'This operation is already in progress', 'IDEMPOTENT_REPLAY_IN_FLIGHT');
}

function mismatch() {
  return new ApiError(409, 'This idempotency key was used for a different operation', 'IDEMPOTENCY_PAYLOAD_MISMATCH');
}

function reconciliationRequired() {
  return new ApiError(409, 'This operation needs reconciliation before it can be retried', 'IDEMPOTENCY_RECONCILIATION_REQUIRED');
}

async function finish(reservation, fields, session = null) {
  return CampaignOperation.findOneAndUpdate(
    {
      _id: reservation._id,
      tenantId: reservation.tenantId,
      status: 'pending',
      fence: reservation.fence,
      leaseOwner: reservation.leaseOwner,
    },
    { $set: fields },
    { returnDocument: 'after', session },
  );
}

async function runExecute(reservation, execute) {
  try {
    const result = await execute();
    const saved = await finish(reservation, { status: 'completed', result, errorCode: '' });
    if (!saved) throw reconciliationRequired();
    return result;
  } catch (error) {
    if (error?.code === 'IDEMPOTENCY_RECONCILIATION_REQUIRED') throw error;
    const errorCode = /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'CAMPAIGN_OPERATION_FAILED';
    await finish(reservation, { status: 'failed', errorCode, result: null });
    throw error;
  }
}

// Allocation alone opts into this contract. The fenced receipt, recipient stamps
// and campaign update commit together; an expired executor cannot commit later.
async function runAtomic(reservation, execute, recovery, initial = false) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const owned = await finish(reservation, { leaseExpiresAt: new Date(Date.now() + LEASE_MS) }, session);
      if (!owned) throw reconciliationRequired();
      const decision = await recovery.inspect(reservation.recoveryProof, session);
      if (decision.outcome === 'completed' && !initial) result = decision.result;
      else if (decision.outcome === 'absent' || (initial && decision.outcome === 'completed')) result = await execute(session);
      else throw reconciliationRequired();
      if (!await finish(reservation, { status: 'completed', result, errorCode: '', retryable: false }, session)) throw reconciliationRequired();
    });
    return result;
  } catch (error) {
    // Unknown commit outcomes never authorize a replay. A committed transaction
    // includes its completed receipt and can subsequently be read without writing.
    if (error?.code !== 'IDEMPOTENCY_RECONCILIATION_REQUIRED') {
      const retryable = Boolean(!error?.hasErrorLabel?.('UnknownTransactionCommitResult')
        && (error?.status >= 500 || error?.hasErrorLabel?.('TransientTransactionError')));
      await finish(reservation, { status: 'failed', retryable, errorCode: /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'CAMPAIGN_OPERATION_FAILED',
        leaseOwner: '', leaseExpiresAt: null });
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function recover(existing, { tenantId, operation, key, fingerprint, reconcile, execute, atomicRecovery }) {
  if (existing.status === 'failed' && !(atomicRecovery && existing.retryable && existing.recoveryProof?.version === 1)) {
    throw new ApiError(422, 'The operation could not be completed', existing.errorCode || 'CAMPAIGN_OPERATION_FAILED');
  }
  const now = new Date();
  const leaseOpen = Boolean(existing.leaseOwner) && existing.leaseExpiresAt && existing.leaseExpiresAt > now;
  if (leaseOpen) throw inFlight();
  const owner = randomBytes(16).toString('hex');
  const acquired = await CampaignOperation.findOneAndUpdate(
    {
      _id: existing._id,
      tenantId,
      status: existing.status,
      fingerprint,
      fence: existing.fence ?? 0,
      $or: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { $lte: now } },
        { leaseOwner: '' },
      ],
    },
    {
      $set: { status: 'pending', leaseOwner: owner, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
      $inc: { fence: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!acquired) {
    const raced = await CampaignOperation.findOne({ tenantId, operation, key });
    if (raced?.status === 'completed' && raced.fingerprint === fingerprint) return raced.result;
    throw inFlight();
  }
  if (atomicRecovery) return runAtomic(acquired, execute, atomicRecovery);
  const decision = typeof reconcile === 'function' ? await reconcile() : { outcome: 'uncertain' };
  if (decision?.outcome === 'completed') {
    const saved = await finish(acquired, { status: 'completed', result: decision.result, errorCode: '' });
    if (!saved) throw reconciliationRequired();
    return decision.result;
  }
  if (decision?.outcome === 'absent') return runExecute(acquired, execute);
  throw reconciliationRequired();
}

export async function withCampaignOperation({ tenantId, operation, key, fingerprint, reconcile, execute, atomicRecovery }) {
  await CampaignOperation.syncIndexes();
  const existing = await CampaignOperation.findOne({ tenantId, operation, key });
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw mismatch();
    if (existing.status === 'completed') return existing.result;
    if (existing.status === 'failed' && !atomicRecovery) {
      throw new ApiError(422, 'The operation could not be completed', existing.errorCode || 'CAMPAIGN_OPERATION_FAILED');
    }
    return recover(existing, { tenantId, operation, key, fingerprint, reconcile, execute, atomicRecovery });
  }
  let reservation;
  try {
    reservation = await CampaignOperation.create({
      tenantId,
      operation,
      key,
      fingerprint,
      status: 'pending',
      leaseOwner: randomBytes(16).toString('hex'),
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      fence: 1,
      recoveryProof: atomicRecovery ? await atomicRecovery.capture() : null,
    });
  } catch (error) {
    if (error?.code === 11000 || error?.cause?.code === 11000) {
      const raced = await CampaignOperation.findOne({ tenantId, operation, key });
      if (!raced) throw error;
      if (raced.fingerprint !== fingerprint) throw mismatch();
      if (raced.status === 'completed') return raced.result;
      return recover(raced, { tenantId, operation, key, fingerprint, reconcile, execute, atomicRecovery });
    }
    throw error;
  }
  return atomicRecovery ? runAtomic(reservation, execute, atomicRecovery, true) : runExecute(reservation, execute);
}
