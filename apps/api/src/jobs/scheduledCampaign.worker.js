import { Worker } from 'bullmq';
import { ensureRedisReady, getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import {
  deliverScheduledCampaign,
  processDueScheduledCampaigns,
} from '../modules/campaigns/campaigns.service.js';
import {
  SCHEDULED_CAMPAIGN_QUEUE,
  clearLocalCampaignDeliveries,
  getScheduledCampaignQueue,
} from './queues.js';

/** Backup poll so overdue sends recover after downtime / missed timers. */
const EVERY_MS = 5_000;

async function runDueScheduled() {
  try {
    const results = await processDueScheduledCampaigns({ limit: 50 });
    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    if (ok || failed.length) {
      logger.info(
        { delivered: ok, failed: failed.length, errors: failed.slice(0, 5) },
        'scheduled campaign delivery pass',
      );
    }
  } catch (err) {
    logger.error({ err: err.message }, 'scheduled campaign delivery failed');
  }
}

async function processScheduledJob(job) {
  const campaignId = job?.data?.campaignId;
  const tenantId = job?.data?.tenantId;
  if (campaignId && tenantId) {
    await deliverScheduledCampaign({ tenantId, campaignId });
    return;
  }
  await runDueScheduled();
}

/**
 * Deliver scheduled campaign invites + point credits at sendAt.
 * Always polls in-process (Redis-less and Redis-up). When Redis is up, also
 * consumes delayed per-campaign jobs queued at launch for exact timing.
 */
export async function startScheduledCampaignWorker() {
  await runDueScheduled();

  const timer = setInterval(runDueScheduled, EVERY_MS);
  timer.unref?.();

  let worker = null;
  if (await ensureRedisReady()) {
    worker = new Worker(SCHEDULED_CAMPAIGN_QUEUE, processScheduledJob, {
      connection: getRedis(),
    });
    worker.on('failed', (_job, err) =>
      logger.error({ err: err.message }, 'scheduled campaign job failed'),
    );
    // Keep a queue handle so delayed jobs from launch share the same Redis connection.
    getScheduledCampaignQueue();
  }

  return {
    close: async () => {
      clearInterval(timer);
      clearLocalCampaignDeliveries();
      if (worker) await worker.close();
    },
  };
}
