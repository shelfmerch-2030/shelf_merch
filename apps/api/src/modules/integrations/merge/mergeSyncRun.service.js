import { logger } from '../../../config/logger.js';
import {
  MERGE_SYNC_RUN_HISTORY,
  MERGE_SYNC_STALE_AFTER_MS,
} from './merge.constants.js';
import { ApiError } from '../../../utils/errors.js';
import { MergeConnection } from './mergeConnection.model.js';
import { MergeSyncRun } from './mergeSyncRun.model.js';
import { mergeHrisSyncJobId } from '../../../jobs/queues.js';

const IN_FLIGHT = new Set(['waiting', 'active', 'delayed', 'paused', 'waiting-children', 'prioritized']);

const MODEL_KEYS = new Set(['employee', 'employment', 'group', 'location', 'contact']);

function safeCode(err) {
  const code = typeof err?.code === 'string' ? err.code : '';
  if (/^[A-Z0-9_]{1,80}$/.test(code)) return code;
  return 'SYNC_FAILED';
}

export async function beginMergeSyncRun({
  tenantId,
  connectionId,
  jobId = '',
  reason = 'manual',
  mode = '',
  attempt = 1,
}) {
  const attemptNo = Math.max(1, Number(attempt) || 1);
  if (jobId && attemptNo > 1) {
    const open = await MergeSyncRun.findOne({
      tenantId,
      connectionId,
      jobId: String(jobId),
      status: { $in: ['running', 'failed', 'queued'] },
    }).sort({ startedAt: -1 });
    if (open) {
      open.status = 'running';
      open.workerAttempt = attemptNo;
      open.retryCount = Math.max(open.retryCount || 0, attemptNo - 1);
      open.mode = mode || open.mode;
      open.lastProgressAt = new Date();
      open.errorCode = '';
      await open.save();
      return open;
    }
  }

  return MergeSyncRun.create({
    tenantId,
    connectionId,
    jobId: jobId ? String(jobId) : '',
    reason,
    mode,
    status: 'running',
    startedAt: new Date(),
    lastProgressAt: new Date(),
    workerAttempt: attemptNo,
    retryCount: Math.max(0, attemptNo - 1),
  });
}

export async function touchMergeSyncRun(run, fields = {}) {
  if (!run?._id) return run;
  const $set = { lastProgressAt: new Date(), ...fields };
  await MergeSyncRun.updateOne({ _id: run._id, tenantId: run.tenantId }, { $set });
  Object.assign(run, $set);
  return run;
}

export async function noteMergeSyncPage(run, model, { pagesProcessed, recordsProcessed }) {
  if (!run?._id || !MODEL_KEYS.has(model)) return;
  const now = new Date();
  await MergeSyncRun.updateOne(
    { _id: run._id, tenantId: run.tenantId },
    {
      $set: {
        lastProgressAt: now,
        [`models.${model}.status`]: 'running',
        [`models.${model}.pagesProcessed`]: pagesProcessed,
        [`models.${model}.recordsProcessed`]: recordsProcessed,
        [`models.${model}.lastPageCompletedAt`]: now,
      },
    },
  );
}

export async function noteMergeSyncRateLimit(run) {
  if (!run?._id) return;
  await MergeSyncRun.updateOne(
    { _id: run._id, tenantId: run.tenantId },
    { $inc: { rateLimitCount: 1 }, $set: { lastProgressAt: new Date() } },
  );
  run.rateLimitCount = (run.rateLimitCount || 0) + 1;
}

export async function finishMergeSyncRun(run, { status, errorCode = '', failedModel = '', mode } = {}) {
  if (!run?._id) return;
  const finishedAt = new Date();
  const started = run.startedAt ? new Date(run.startedAt).getTime() : finishedAt.getTime();
  await MergeSyncRun.updateOne(
    { _id: run._id, tenantId: run.tenantId },
    {
      $set: {
        status,
        finishedAt,
        lastProgressAt: finishedAt,
        durationMs: Math.max(0, finishedAt.getTime() - started),
        errorCode: errorCode || '',
        failedModel: failedModel || '',
        ...(mode ? { mode } : {}),
        ...(failedModel ? { [`models.${failedModel}.status`]: 'failed', [`models.${failedModel}.errorCode`]: errorCode || '' } : {}),
        ...(status === 'success'
          ? {
              'models.employee.status': 'success',
              'models.employment.status': 'success',
              'models.group.status': 'success',
              'models.location.status': 'success',
              'models.contact.status': 'success',
            }
          : {}),
      },
    },
  );
  await trimMergeSyncRuns({ tenantId: run.tenantId, connectionId: run.connectionId });
}

async function trimMergeSyncRuns({ tenantId, connectionId }) {
  const extra = await MergeSyncRun.find({
    tenantId,
    connectionId,
    status: { $in: ['success', 'failed', 'cancelled', 'stale'] },
  })
    .sort({ startedAt: -1 })
    .skip(MERGE_SYNC_RUN_HISTORY)
    .select('_id')
    .lean();
  if (!extra.length) return;
  await MergeSyncRun.deleteMany({ tenantId, _id: { $in: extra.map((row) => row._id) } });
}

export async function getMergeSyncStatus({ tenantId, connectionId }) {
  const connection = await MergeConnection.findOne({ _id: connectionId, tenantId }).select(
    'status lastSyncStatus lastSyncAt lastSyncRequestedAt lastSyncStartedAt lastSyncFinishedAt lastFullSyncAt lastError',
  );
  if (!connection) {
    throw new ApiError(404, 'Merge connection not found', 'MERGE_CONNECTION_NOT_FOUND');
  }
  const runs = await listMergeSyncRuns({ tenantId, connectionId });
  const activeRun = runs.find((run) => run.status === 'running' || run.status === 'queued') || null;
  return {
    connectionId: String(connection._id),
    connectionStatus: connection.status,
    lastSyncStatus: connection.lastSyncStatus || 'idle',
    lastSyncAt: connection.lastSyncAt || null,
    lastSyncRequestedAt: connection.lastSyncRequestedAt || null,
    lastSyncStartedAt: connection.lastSyncStartedAt || null,
    lastSyncFinishedAt: connection.lastSyncFinishedAt || null,
    lastFullSyncAt: connection.lastFullSyncAt || null,
    lastError: connection.lastError || null,
    activeRun,
    runs,
  };
}

export async function listMergeSyncRuns({ tenantId, connectionId, limit = MERGE_SYNC_RUN_HISTORY }) {
  const runs = await MergeSyncRun.find({ tenantId, connectionId })
    .sort({ startedAt: -1 })
    .limit(Math.min(MERGE_SYNC_RUN_HISTORY, Math.max(1, Number(limit) || MERGE_SYNC_RUN_HISTORY)));
  return runs.map((run) => run.toPublicJSON());
}

/**
 * Mark queued/syncing connections failed only when the lease is expired,
 * progress is older than the stale threshold, and BullMQ has no live job.
 */
export async function recoverStaleMergeSyncs({ queue, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - MERGE_SYNC_STALE_AFTER_MS);
  const rows = await MergeConnection.find({
    lastSyncStatus: { $in: ['queued', 'syncing'] },
    $or: [{ syncLockUntil: null }, { syncLockUntil: { $lte: now } }],
  })
    .setOptions({ skipTenantGuard: true })
    .select('_id tenantId lastSyncStatus lastSyncStartedAt lastSyncRequestedAt syncLockUntil syncLockToken');

  let recovered = 0;
  for (const row of rows) {
    if (queue) {
      try {
        const job = await queue.getJob(mergeHrisSyncJobId(row._id));
        if (job) {
          const state = await job.getState();
          if (IN_FLIGHT.has(state)) continue;
        }
      } catch (err) {
        logger.warn({ connectionId: String(row._id), code: err?.code || err?.name }, 'Merge stale check skipped');
        continue;
      }
    }

    const run = await MergeSyncRun.findOne({
      tenantId: row.tenantId,
      connectionId: row._id,
      status: { $in: ['running', 'queued'] },
    })
      .sort({ startedAt: -1 })
      .setOptions({ skipTenantGuard: true });
    const progressAt = run?.lastProgressAt || row.lastSyncStartedAt || row.lastSyncRequestedAt;
    if (progressAt && new Date(progressAt) > cutoff) continue;

    await MergeConnection.updateOne(
      {
        _id: row._id,
        tenantId: row.tenantId,
        lastSyncStatus: { $in: ['queued', 'syncing'] },
        $or: [{ syncLockUntil: null }, { syncLockUntil: { $lte: now } }],
      },
      {
        $set: {
          lastSyncStatus: 'failed',
          lastError: 'MERGE_SYNC_STALE',
          lastSyncFinishedAt: now,
          syncLockToken: '',
          syncLockUntil: null,
        },
      },
    );
    if (run) {
      await finishMergeSyncRun(run, { status: 'stale', errorCode: 'MERGE_SYNC_STALE' });
    }
    recovered += 1;
    logger.info(
      {
        event: 'merge_sync_stale_recovered',
        connectionId: String(row._id),
        organizationId: String(row.tenantId),
        syncRunId: run ? String(run._id) : null,
      },
      'merge_sync_stale_recovered',
    );
  }
  return recovered;
}

export { safeCode as safeMergeSyncRunError };
