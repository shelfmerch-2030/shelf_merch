import { logger } from '../../../config/logger.js';
import {
  MERGE_SCHEDULE_EVERY_MS,
  MERGE_SCHEDULE_JOB_ID,
  MERGE_SCHEDULE_JOB_NAME,
  MERGE_SCHEDULE_PAGE_SIZE,
} from './merge.constants.js';
import { MergeConnection } from './mergeConnection.model.js';
import { reconcileMergeConnectionIfHealthy } from './merge.service.js';
import { enqueueMergeHrisSync, getMergeHrisSyncQueue } from '../../../jobs/queues.js';

/**
 * One 6-hour sweep on merge-hris-sync.
 * BullMQ 5 upserts a job scheduler by id, so several worker processes share it.
 * Older repeatable jobs with the same name are removed so a restart cannot
 * leave a second sweep behind. Queues without the scheduler API keep queue.add.
 */
export async function registerMergeHrisSyncSchedule(queue = getMergeHrisSyncQueue()) {
  if (typeof queue.upsertJobScheduler === 'function') {
    await queue.upsertJobScheduler(
      MERGE_SCHEDULE_JOB_ID,
      { every: MERGE_SCHEDULE_EVERY_MS },
      {
        name: MERGE_SCHEDULE_JOB_NAME,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 50 },
      },
    );
    if (typeof queue.getRepeatableJobs === 'function') {
      const legacy = await queue.getRepeatableJobs();
      for (const job of legacy) {
        if (job?.name === MERGE_SCHEDULE_JOB_NAME && job.key) {
          await queue.removeRepeatableByKey(job.key);
        }
      }
    }
  } else {
    await queue.add(
      MERGE_SCHEDULE_JOB_NAME,
      {},
      {
        repeat: { every: MERGE_SCHEDULE_EVERY_MS },
        jobId: MERGE_SCHEDULE_JOB_ID,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }
  logger.info({ everyMs: MERGE_SCHEDULE_EVERY_MS }, 'Merge HRIS schedule registered');
}

export async function enqueueScheduledMergeHrisSyncs({
  enqueue = enqueueMergeHrisSync,
  pageSize = MERGE_SCHEDULE_PAGE_SIZE,
} = {}) {
  const queued = [];
  let afterId = null;
  const size = Math.max(1, Number(pageSize) || MERGE_SCHEDULE_PAGE_SIZE);
  for (;;) {
    const filter = {
      category: 'hris',
      status: { $in: ['connected', 'needs_attention'] },
      encryptedAccountToken: { $nin: ['', null] },
    };
    if (afterId) filter._id = { $gt: afterId };
    const connections = await MergeConnection.find(filter)
      .setOptions({ skipTenantGuard: true })
      .sort({ _id: 1 })
      .limit(size)
      .select('_id tenantId status encryptedAccountToken provider disconnectedByUser mergeLinkedAccountId lastSyncAt');
    if (!connections.length) break;
    for (const connection of connections) {
      await enqueueOneScheduledConnection(connection, enqueue, queued);
    }
    afterId = connections[connections.length - 1]._id;
    if (connections.length < size) break;
  }

  logger.info({ connections: queued.length }, 'Merge HRIS scheduled sync sweep finished');
  return queued;
}

async function enqueueOneScheduledConnection(connection, enqueue, queued) {
  if (connection.disconnectedByUser || connection.status === 'disconnected') return;
  let doc = connection;
  if (doc.status === 'needs_attention') {
    try {
      doc = await reconcileMergeConnectionIfHealthy(doc);
    } catch (err) {
      logger.warn(
        { connectionId: String(connection._id), code: err?.code || err?.name },
        'Merge scheduled reconcile failed',
      );
      return;
    }
    if (doc.disconnectedByUser || doc.status !== 'connected' || !doc.encryptedAccountToken) return;
  }
  if (doc.disconnectedByUser || doc.status !== 'connected' || !doc.encryptedAccountToken) return;

  try {
    const result = await enqueue({
      tenantId: String(doc.tenantId),
      connectionId: String(doc._id),
      requestedByUserId: null,
      reason: doc.lastSyncAt ? 'scheduled' : 'initial',
    });
    queued.push({ connectionId: String(doc._id), ...result });
  } catch (err) {
    logger.warn(
      { connectionId: String(doc._id), code: err?.code || err?.name, event: 'merge_schedule_enqueue_failed' },
      'merge_schedule_enqueue_failed',
    );
  }
}
