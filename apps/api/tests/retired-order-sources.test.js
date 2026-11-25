import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as queues from '../src/jobs/queues.js';

const app = createApp();
const connectionId = '507f1f77bcf86cd799439011';

describe('retired external order imports', () => {
  it.each([
    ['get', '/api/v1/platform/order-sources'],
    ['post', '/api/v1/platform/order-sources'],
    ['post', '/api/v1/platform/order-sources/preview'],
    ['get', `/api/v1/platform/order-sources/${connectionId}`],
    ['post', `/api/v1/platform/order-sources/${connectionId}/sync`],
    ['post', `/api/v1/order-sources/webhook/${connectionId}`],
  ])('%s %s is no longer available', async (method, path) => {
    const response = await request(app)[method](path).send({});
    expect(response.status).toBe(404);
  });

  it('cannot enqueue order polling, inbound webhooks or fulfillment pushes', () => {
    for (const name of [
      'getOrderSourceSyncQueue',
      'enqueueOrderSourceSync',
      'enqueueOrderSourceWebhook',
      'enqueueOrderSourceFulfillment',
    ]) {
      expect(queues).not.toHaveProperty(name);
    }
  });
});
