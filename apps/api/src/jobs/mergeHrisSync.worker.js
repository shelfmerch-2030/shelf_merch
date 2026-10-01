import { UnrecoverableError, Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { MERGE_HRIS_SYNC_QUEUE, MERGE_SCHEDULE_JOB_NAME } from '../modules/integrations/merge/merge.constants.js';
import { MergeConnection } from '../modules/integrations/merge/mergeConnection.model.js';
import { runMergeHrisSync } from '../modules/integrations/merge/mergeSync.service.js';
import {
  enqueueScheduledMergeHrisSyncs,
  registerMergeHrisSyncSchedule,
} from '../modules/integrations/merge/mergeSchedule.js';
import { getMergeHrisSyncQueue } from './queues.js';
import { recoverStaleMergeSyncs } from '../modules/integrations/merge/mergeSyncRun.service.js';
import {
  isMergeSyncJobRetryable,
  safeMergeJobErrorCode,
} from '../modules/integrations/merge/mergeSyncErrors.js';

export { isMergeSyncJobRetryable, safeMergeJobErrorCode };

/**
 * If a crashed worker left the row queued or syncing, a terminal job failure
 * must not leave that status in place. Does not change connection status.
 */
export async function markMergeSyncJobFailed({ tenantId, connectionId, err }) {
  if (!tenantId || !connectionId) return;
  await MergeConnection.updateOne(
    {
      _id: connectionId,
      tenantId,
      lastSyncStatus: { $in: ['queued', 'syncing'] },
    },
    {
      $set: {
        lastSyncStatus: 'failed',
        lastError: safeMergeJobErrorCode(err),
        lastSyncFinishedAt: new Date(),
        syncLockToken: '',
        syncLockUntil: null,
      },
    },
  );
}

export async function processMergeHrisSyncJob(job) {
  if (job?.name === MERGE_SCHEDULE_JOB_NAME) {
    await enqueueScheduledMergeHrisSyncs();
    return;
  }

  const data = job?.data || {};
  const tenantId = data.tenantId ? String(data.tenantId) : '';
  const connectionId = data.connectionId ? String(data.connectionId) : '';
  const reason = data.reason || 'manual';
  const requestedByUserId = data.requestedByUserId ? String(data.requestedByUserId) : null;

  if (!tenantId || !connectionId) {
    throw new UnrecoverableError('MERGE_SYNC_JOB_INVALID');
  }
  for (const key of Object.keys(data)) {
    if (!['tenantId', 'connectionId', 'requestedByUserId', 'reason'].includes(key)) {
      throw new UnrecoverableError('MERGE_SYNC_JOB_INVALID');
    }
  }

  logger.info(
    { jobId: job?.id, connectionId, organizationId: tenantId, reason },
    'Merge HRIS sync job started',
  );

  try {
    await runMergeHrisSync({
      tenantId,
      connectionId,
      requestedByUserId,
      reason,
      jobId: job?.id ? String(job.id) : '',
      attempt: Number(job?.attemptsMade) || 1,
      maxAttempts: Number(job?.opts?.attempts) || 1,
      onProgress: (value) => job.updateProgress?.(value),
    });
  } catch (err) {
    if (!isMergeSyncJobRetryable(err)) {
      const code = safeMergeJobErrorCode(err);
      const wrapped = new UnrecoverableError(code);
      wrapped.code = code;
      throw wrapped;
    }
    throw err;
  }
}

export function startMergeHrisSyncWorker() {
  const worker = new Worker(MERGE_HRIS_SYNC_QUEUE, processMergeHrisSyncJob, {
    connection: getRedis(),
    // Two jobs at once. Each Linked Account is still limited to one import by
    // the DB lease, and Merge rate limits are per account. Raising this would
    // add database and memory pressure for large directories without helping
    // a single tenant. Separate accounts may run in parallel.
    concurrency: 2,
    // Renewed while the processor runs. Longer than the 2-minute DB lease so a
    // crash frees the DB lock before BullMQ treats the job as stalled and retries.
    lockDuration: 5 * 60 * 1000,
  });

  worker.on('failed', (job, err) => {
    const attempts = Number(job?.opts?.attempts) || 1;
    const made = Number(job?.attemptsMade) || attempts;
    const terminal = err instanceof UnrecoverableError || made >= attempts;
    logger.error(
      {
        jobId: job?.id,
        connectionId: job?.data?.connectionId,
        code: safeMergeJobErrorCode(err),
        attemptsMade: made,
        terminal,
      },
      'Merge HRIS sync job failed',
    );
    if (!terminal || !job?.data?.connectionId) return;
    if (safeMergeJobErrorCode(err) === 'MERGE_SYNC_LOCK_LOST') return;
    markMergeSyncJobFailed({
      tenantId: job.data.tenantId,
      connectionId: job.data.connectionId,
      err,
    }).catch((markErr) => {
      logger.error(
        { code: markErr?.code || markErr?.name },
        'Could not record Merge sync failure',
      );
    });
  });

  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'Merge HRIS sync worker error');
  });

  void registerMergeHrisSyncSchedule(getMergeHrisSyncQueue()).catch((err) => {
    logger.error({ code: err?.code || err?.name }, 'Merge HRIS schedule registration failed');
  });

  void recoverStaleMergeSyncs({ queue: getMergeHrisSyncQueue() }).catch((err) => {
    logger.error({ code: err?.code || err?.name }, 'Merge stale sync recovery failed');
  });

  return worker;
}
