import { Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { runShopifyImportJob } from '../modules/catalog/shopifyImportJob.service.js';

export function startShopifyImportWorker() {
  const worker = new Worker('shopify-import', (job) => runShopifyImportJob(job.data), {
    connection: getRedis(),
    concurrency: 2,
  });
  // Do not log the job payload: Redis holds the single-use Shopify credential.
  worker.on('failed', (job) => logger.error({ jobId: job?.data?.jobId }, 'Shopify import worker failed'));
  return worker;
}
