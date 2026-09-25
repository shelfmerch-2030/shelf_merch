import { Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { deliverNotification } from '../modules/notifications/notifications.service.js';

export function startNotificationWorker() {
  const worker = new Worker(
    'notifications',
    async (job) => {
      await deliverNotification(job.data);
    },
    { connection: getRedis(), concurrency: 5 },
  );
  worker.on('failed', (job, err) => logger.error({ type: job?.data?.type, err }, 'Notification delivery failed'));
  worker.on('error', (err) => logger.error({ err: err.message }, 'Notification worker error'));
  return worker;
}
