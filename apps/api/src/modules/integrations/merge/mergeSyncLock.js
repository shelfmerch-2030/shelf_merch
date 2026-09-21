import crypto from 'node:crypto';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import { MergeConnection } from './mergeConnection.model.js';

export const MERGE_SYNC_LOCK_LEASE_MS = 2 * 60 * 1000;
export const MERGE_SYNC_LOCK_RENEW_EVERY_MS = 30 * 1000;

export function mergeSyncInProgressError() {
  return new ApiError(409, 'Sync already in progress', 'MERGE_SYNC_IN_PROGRESS');
}

export function mergeSyncLockLostError() {
  return new ApiError(409, 'Sync was superseded', 'MERGE_SYNC_LOCK_LOST');
}

function leaseUntil(now, leaseMs) {
  return new Date(now.getTime() + leaseMs);
}

/** Atomic acquire. Winner gets a token; loser gets null. */
export async function acquireMergeSyncLock({
  tenantId,
  connectionId,
  leaseMs = MERGE_SYNC_LOCK_LEASE_MS,
  now = new Date(),
}) {
  const token = crypto.randomUUID();
  const connection = await MergeConnection.findOneAndUpdate(
    {
      _id: connectionId,
      tenantId,
      $or: [
        { syncLockUntil: null },
        { syncLockUntil: { $exists: false } },
        { syncLockUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        syncLockToken: token,
        syncLockUntil: leaseUntil(now, leaseMs),
        lastSyncStatus: 'syncing',
        lastError: '',
      },
    },
    { new: true },
  );
  if (!connection) return null;
  return { connection, token };
}

/** Extend the lease only if this token still owns it. */
export async function renewMergeSyncLock({
  tenantId,
  connectionId,
  token,
  leaseMs = MERGE_SYNC_LOCK_LEASE_MS,
  now = new Date(),
}) {
  if (!token) return null;
  return MergeConnection.findOneAndUpdate(
    { _id: connectionId, tenantId, syncLockToken: token },
    { $set: { syncLockUntil: leaseUntil(now, leaseMs) } },
    { new: true },
  );
}

export async function assertMergeSyncLockOwned({ tenantId, connectionId, token }) {
  if (!token) throw mergeSyncLockLostError();
  const doc = await MergeConnection.findOne({
    _id: connectionId,
    tenantId,
    syncLockToken: token,
  }).select('_id');
  if (!doc) throw mergeSyncLockLostError();
  return doc;
}

/** Terminal success/failure write + lock release, only if we still own the token. */
export async function completeMergeSyncLock({ tenantId, connectionId, token, fields }) {
  if (!token) return null;
  return MergeConnection.findOneAndUpdate(
    { _id: connectionId, tenantId, syncLockToken: token },
    {
      $set: {
        ...fields,
        syncLockToken: '',
        syncLockUntil: null,
      },
    },
    { new: true },
  );
}

export async function releaseMergeSyncLock({ tenantId, connectionId, token }) {
  if (!token) return null;
  return MergeConnection.findOneAndUpdate(
    { _id: connectionId, tenantId, syncLockToken: token },
    { $set: { syncLockToken: '', syncLockUntil: null } },
    { new: true },
  );
}

/**
 * Periodic token-scoped lease renewal. Stops itself if ownership is gone.
 * Transient Mongo errors are logged and retried on the next tick.
 */
export function startMergeSyncLockHeartbeat({
  tenantId,
  connectionId,
  token,
  leaseMs = MERGE_SYNC_LOCK_LEASE_MS,
  renewEveryMs = MERGE_SYNC_LOCK_RENEW_EVERY_MS,
  onLost,
}) {
  let stopped = false;
  let inFlight = false;

  const timer = setInterval(() => {
    if (stopped || inFlight) return;
    inFlight = true;
    renewMergeSyncLock({ tenantId, connectionId, token, leaseMs })
      .then((doc) => {
        if (stopped) return;
        if (!doc) {
          stopped = true;
          clearInterval(timer);
          onLost?.();
        }
      })
      .catch((err) => {
        logger.warn(
          {
            organizationId: String(tenantId),
            connectionId: String(connectionId),
            code: err?.code || err?.name,
          },
          'Merge sync lock renew failed',
        );
      })
      .finally(() => {
        inFlight = false;
      });
  }, renewEveryMs);

  return function stopMergeSyncLockHeartbeat() {
    stopped = true;
    clearInterval(timer);
  };
}
