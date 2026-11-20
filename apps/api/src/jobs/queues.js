import { Queue } from 'bullmq';
import { ensureRedisReady, getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { processCsvImport } from '../modules/imports/imports.service.js';
import { runShopifyImportJob } from '../modules/catalog/shopifyImportJob.service.js';
import {
  MERGE_HRIS_SYNC_QUEUE,
  MERGE_SYNC_JOB_ATTEMPTS,
  MERGE_SYNC_JOB_BACKOFF_MS,
  MERGE_SYNC_REASONS,
} from '../modules/integrations/merge/merge.constants.js';
import { MergeConnection } from '../modules/integrations/merge/mergeConnection.model.js';
import { ApiError } from '../utils/errors.js';

export const SCHEDULED_CAMPAIGN_QUEUE = 'scheduled-campaigns';
const MAX_IN_PROCESS_DELAY_MS = 2_147_483_647;

let csvImportQueue = null;
let shopifyImportQueue = null;
let notificationQueue = null;
let scheduledCampaignQueue = null;
let mergeHrisSyncQueue = null;

const MERGE_SYNC_IN_FLIGHT_STATES = new Set([
  'waiting',
  'active',
  'delayed',
  'paused',
  'waiting-children',
  'prioritized',
]);

const MERGE_SYNC_PAYLOAD_KEYS = ['tenantId', 'connectionId', 'requestedByUserId', 'reason'];
const localDeliveryTimers = new Map();

function makeQueue(name) {
  const queue = new Queue(name, { connection: getRedis() });
  queue.on('error', (err) => {
    logger.error({ err: err.message, queue: name }, 'queue connection error');
  });
  return queue;
}

export function getCsvImportQueue() {
  if (!csvImportQueue) csvImportQueue = makeQueue('csv-import');
  return csvImportQueue;
}

export function getShopifyImportQueue() {
  if (!shopifyImportQueue) shopifyImportQueue = makeQueue('shopify-import');
  return shopifyImportQueue;
}

export async function enqueueShopifyImport({ jobId, domain, accessToken, only }) {
  const payload = { jobId: String(jobId), domain, accessToken, only };
  let timeout;
  try {
    if (!(await ensureRedisReady())) throw new Error('Redis not ready');
    // A disconnect after the readiness probe must not hold the HTTP response open.
    // The runner claims queued jobs atomically if this add eventually succeeds too.
    await Promise.race([
      getShopifyImportQueue().add('import', payload, {
        jobId: `shopify-import-${jobId}`,
        removeOnComplete: true,
        removeOnFail: true,
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Shopify enqueue timed out')), 3_000);
      }),
    ]);
  } catch {
    logger.warn({ jobId: String(jobId) }, 'Redis unavailable; processing Shopify import inline');
    setImmediate(() => {
      runShopifyImportJob(payload).catch(() =>
        logger.error({ jobId: String(jobId) }, 'Inline Shopify import failed'),
      );
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function getNotificationQueue() {
  if (!notificationQueue) notificationQueue = makeQueue('notifications');
  return notificationQueue;
}

export function getScheduledCampaignQueue() {
  if (!scheduledCampaignQueue) scheduledCampaignQueue = makeQueue(SCHEDULED_CAMPAIGN_QUEUE);
  return scheduledCampaignQueue;
}

/** BullMQ 5 rejects custom ids containing ":". One queued or running job per connection. */
export function mergeHrisSyncJobId(connectionId) {
  return `merge-hris-sync-${String(connectionId)}`;
}

export function getMergeHrisSyncQueue() {
  if (!mergeHrisSyncQueue) mergeHrisSyncQueue = makeQueue(MERGE_HRIS_SYNC_QUEUE);
  return mergeHrisSyncQueue;
}

function mergeSyncJobPayload(input) {
  const tenantId = input?.tenantId ? String(input.tenantId) : '';
  const connectionId = input?.connectionId ? String(input.connectionId) : '';
  const reason = input?.reason || 'manual';
  if (!tenantId || !connectionId || !MERGE_SYNC_REASONS.includes(reason)) {
    throw new ApiError(400, 'Sync job is missing identifiers', 'MERGE_SYNC_JOB_INVALID');
  }
  for (const key of Object.keys(input || {})) {
    if (!MERGE_SYNC_PAYLOAD_KEYS.includes(key)) {
      throw new ApiError(400, 'Sync job must not carry credentials', 'MERGE_SYNC_JOB_INVALID');
    }
  }
  return {
    tenantId,
    connectionId,
    requestedByUserId: input.requestedByUserId ? String(input.requestedByUserId) : null,
    reason,
  };
}

/**
 * Enqueue one Merge HRIS import. Payload is identifiers only.
 * A live job for the same connection is not enqueued again.
 * Redis-down does not run the import inside the HTTP request.
 */
export async function enqueueMergeHrisSync(input, deps = {}) {
  const payload = mergeSyncJobPayload(input);
  const ready = deps.ensureReady ? await deps.ensureReady() : await ensureRedisReady();
  if (!ready) {
    throw new ApiError(503, 'Sync queue is unavailable', 'MERGE_QUEUE_UNAVAILABLE');
  }

  const queue = deps.queue || getMergeHrisSyncQueue();
  const jobId = mergeHrisSyncJobId(payload.connectionId);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (MERGE_SYNC_IN_FLIGHT_STATES.has(state)) {
      const row = await MergeConnection.findOne({
        _id: payload.connectionId,
        tenantId: payload.tenantId,
      })
        .select('lastSyncStatus')
        .lean();
      const syncStatus =
        row?.lastSyncStatus === 'syncing' || state === 'active' ? 'syncing' : 'queued';
      return {
        queued: false,
        alreadyQueuedOrRunning: true,
        connectionId: payload.connectionId,
        jobId,
        syncStatus,
      };
    }
    await existing.remove().catch(() => {});
  }

  let job;
  try {
    job = await queue.add('sync', payload, {
      jobId,
      attempts: MERGE_SYNC_JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: MERGE_SYNC_JOB_BACKOFF_MS },
      removeOnComplete: true,
      removeOnFail: 50,
    });
  } catch (err) {
    if (/already exists|JobId/i.test(String(err?.message || ''))) {
      return {
        queued: false,
        alreadyQueuedOrRunning: true,
        connectionId: payload.connectionId,
        jobId,
        syncStatus: 'queued',
      };
    }
    throw err;
  }

  await MergeConnection.updateOne(
    { _id: payload.connectionId, tenantId: payload.tenantId },
    {
      $set: {
        lastSyncStatus: 'queued',
        lastError: '',
        lastSyncRequestedAt: new Date(),
      },
    },
  );

  logger.info(
    {
      jobId: String(job.id || jobId),
      connectionId: payload.connectionId,
      organizationId: payload.tenantId,
      reason: payload.reason,
    },
    'Merge HRIS sync queued',
  );

  return {
    queued: true,
    alreadyQueuedOrRunning: false,
    connectionId: payload.connectionId,
    jobId: String(job.id || jobId),
    syncStatus: 'queued',
  };
}

function clearLocalDeliveryTimer(campaignId) {
  const key = String(campaignId);
  const existing = localDeliveryTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    localDeliveryTimers.delete(key);
  }
}

async function runLocalScheduledDelivery({ tenantId, campaignId }) {
  localDeliveryTimers.delete(String(campaignId));
  try {
    const { deliverScheduledCampaign } = await import('../modules/campaigns/campaigns.service.js');
    await deliverScheduledCampaign({ tenantId, campaignId });
  } catch (err) {
    logger.error(
      { err: err.message, campaignId: String(campaignId) },
      'in-process scheduled campaign delivery failed',
    );
  }
}

/** Fire delivery at sendAt in this process (survives Redis-less deploys; lost on restart). */
export function scheduleLocalCampaignDelivery({ tenantId, campaignId, sendAt }) {
  const at = new Date(sendAt).getTime();
  if (!Number.isFinite(at)) return;
  const delay = Math.max(0, at - Date.now());
  if (delay > MAX_IN_PROCESS_DELAY_MS) return;
  clearLocalDeliveryTimer(campaignId);
  const timer = setTimeout(() => {
    void runLocalScheduledDelivery({ tenantId, campaignId });
  }, delay);
  timer.unref?.();
  localDeliveryTimers.set(String(campaignId), timer);
}

export function clearLocalCampaignDeliveries() {
  for (const timer of localDeliveryTimers.values()) clearTimeout(timer);
  localDeliveryTimers.clear();
}

/**
 * Arm exact-time delivery for a launched scheduled campaign.
 * Uses an in-process timer plus a Redis delayed job when available.
 */
export async function enqueueScheduledCampaignDelivery({ tenantId, campaignId, sendAt }) {
  scheduleLocalCampaignDelivery({ tenantId, campaignId, sendAt });
  try {
    if (!(await ensureRedisReady())) return;
    const delay = Math.max(0, new Date(sendAt).getTime() - Date.now());
    if (!Number.isFinite(delay)) return;
    const queue = getScheduledCampaignQueue();
    const jobId = `scheduled-campaign:${campaignId}`;
    const existing = await queue.getJob(jobId);
    if (existing) await existing.remove().catch(() => {});
    await queue.add(
      'deliver-campaign',
      { tenantId: String(tenantId), campaignId: String(campaignId) },
      { delay, jobId, removeOnComplete: true, removeOnFail: 50 },
    );
  } catch (err) {
    logger.warn({ err: err.message, campaignId: String(campaignId) }, 'Could not enqueue delayed scheduled campaign job');
  }
}

/**
 * Enqueue a CSV import; if Redis is unreachable, degrade to inline
 * processing so dev environments without a worker still function.
 */
export async function enqueueCsvImport({ tenantId, jobId }) {
  try {
    if (!(await ensureRedisReady())) throw new Error('Redis not ready');
    await getCsvImportQueue().add('import', { tenantId: String(tenantId), jobId: String(jobId) });
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis unavailable — processing CSV import inline');
    setImmediate(() =>
      processCsvImport({ tenantId, jobId }).catch((e) =>
        logger.error({ err: e }, 'Inline CSV import failed'),
      ),
    );
  }
}
