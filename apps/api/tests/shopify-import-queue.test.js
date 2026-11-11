import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(), run: vi.fn(), ready: vi.fn(), worker: vi.fn(),
}));
vi.mock('bullmq', () => ({
  Queue: class { add = mocks.add; on = vi.fn(); },
  Worker: class { constructor(...args) { mocks.worker(...args); } on = vi.fn(); },
}));
vi.mock('../src/config/redis.js', () => ({ ensureRedisReady: mocks.ready, getRedis: () => ({}) }));
vi.mock('../src/modules/catalog/shopifyImportJob.service.js', () => ({ runShopifyImportJob: mocks.run }));
vi.mock('../src/config/logger.js', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { enqueueShopifyImport } from '../src/jobs/queues.js';
import { startShopifyImportWorker } from '../src/jobs/shopifyImport.worker.js';

const payload = { jobId: '123', domain: 'demo.myshopify.com', accessToken: 'shpat_test', only: 'products' };

beforeEach(() => {
  mocks.ready.mockResolvedValue(true);
  mocks.add.mockResolvedValue({ id: '123' });
  mocks.run.mockResolvedValue({ status: 'done' });
});
afterEach(() => vi.resetAllMocks());

describe('Shopify job dispatch', () => {
  it('queues the credential only in Redis and removes completed or failed payloads', async () => {
    await enqueueShopifyImport(payload);
    expect(mocks.add).toHaveBeenCalledWith('import', payload, {
      jobId: 'shopify-import-123', removeOnComplete: true, removeOnFail: true,
    });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it.each(['probe', 'enqueue'])('runs after returning when Redis fails at %s', async (stage) => {
    if (stage === 'probe') mocks.ready.mockResolvedValue(false);
    else mocks.add.mockRejectedValue(new Error('Connection lost'));
    await enqueueShopifyImport(payload);
    expect(mocks.run).not.toHaveBeenCalled();
    await new Promise(setImmediate);
    expect(mocks.run).toHaveBeenCalledWith(payload);
  });

  it('registers the worker with the shared runner', async () => {
    startShopifyImportWorker();
    const [queue, processor, options] = mocks.worker.mock.calls[0];
    expect(queue).toBe('shopify-import');
    expect(options.concurrency).toBe(2);
    await processor({ data: payload });
    expect(mocks.run).toHaveBeenCalledWith(payload);
  });

  it('bounds enqueue latency when Redis disconnects after the readiness probe', async () => {
    vi.useFakeTimers();
    try {
      mocks.add.mockImplementation(() => new Promise(() => {}));
      const enqueued = enqueueShopifyImport(payload);
      await vi.advanceTimersByTimeAsync(3_000);
      await enqueued;
      await vi.runOnlyPendingTimersAsync();
      expect(mocks.run).toHaveBeenCalledWith(payload);
    } finally {
      vi.useRealTimers();
    }
  });
});
