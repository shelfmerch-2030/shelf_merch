import { Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import {
  WEBHOOK_QUEUE,
  WEBHOOK_SWEEP_EVERY_MS,
  WEBHOOK_SWEEP_JOB,
} from '../modules/webhooks/webhooks.constants.js';
import { attemptDelivery, sweepDueDeliveries } from '../modules/webhooks/webhooks.service.js';
import { getWebhookQueue } from './queues.js';

export async function processWebhookJob(job) {
  if (job?.name === WEBHOOK_SWEEP_JOB) return sweepDueDeliveries();
  if (!job?.data?.deliveryId) return { skipped: true };
  return attemptDelivery(job.data.deliveryId);
}

export function startWebhookDeliveryWorker() {
  const worker = new Worker(WEBHOOK_QUEUE, processWebhookJob, {
    connection: getRedis(),
    // Deliveries are I/O-bound (10s timeout each); a slow client must not stall others.
    concurrency: 10,
  });
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err?.message }, 'Webhook job failed'));
  worker.on('error', (err) => logger.error({ err: err.message }, 'Webhook worker error'));

  void getWebhookQueue()
    .upsertJobScheduler(
      'webhook-sweep',
      { every: WEBHOOK_SWEEP_EVERY_MS },
      { name: WEBHOOK_SWEEP_JOB, data: {}, opts: { removeOnComplete: true, removeOnFail: 20 } },
    )
    .catch((err) => logger.error({ err: err?.message }, 'Webhook sweep schedule registration failed'));
  return worker;
}
