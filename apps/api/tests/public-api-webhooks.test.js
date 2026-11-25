import http from 'node:http';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The real queue needs the worker process. Here, a due delivery is attempted
// in-process (what the worker would do); delayed retries are left to the sweep.
vi.mock('../src/jobs/queues.js', async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueWebhookDelivery: vi.fn(async ({ deliveryId, delayMs = 0 }) => {
    if (delayMs > 0) return { queued: true };
    setImmediate(async () => {
      const { attemptDelivery } = await import('../src/modules/webhooks/webhooks.service.js');
      await attemptDelivery(deliveryId).catch(() => {});
    });
    return { queued: true };
  }),
}));
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import * as envModule from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { createApiKey } from '../src/modules/apiKeys/apiKeys.service.js';
import { transitionState } from '../src/services/stateMachine.service.js';
import {
  signPayload,
  sweepDueDeliveries,
  verifySignature,
} from '../src/modules/webhooks/webhooks.service.js';
import { WebhookDelivery, WebhookEndpoint } from '../src/modules/webhooks/webhook.models.js';

/** A local receiver: records requests; `respond` decides the status code. */
let server;
let received = [];
let respond = () => 200;
let baseUrl;

let app;
let tenant;
let admin;
let liveKey;
let testKey;

async function waitFor(fn, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timed out waiting');
}

async function addEndpoint(body) {
  const res = await request(app).post('/api/v1/developers/webhooks').set('Authorization', `Bearer ${admin.token}`).send(body);
  expect(res.status).toBe(201);
  return res.body;
}

let n = 0;
function createOrder(token, extra = {}) {
  return request(app)
    .post('/api/public/v1/orders')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', `wh-${++n}`)
    .send({
      external_id: `EXT-${n}`,
      shipping_address: { name: 'Asha', phone: '9876543210', line1: '1 MG Road', city: 'Pune', state: 'MH', pincode: '411001' },
      items: [{ sku: 'SM-MUG-1', quantity: 1 }],
      ...extra,
    });
}

beforeAll(async () => {
  await connectTestDb();
  envModule.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  app = createApp();
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received.push({ path: req.url, headers: req.headers, body });
      const status = respond(req);
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end(status < 300 ? 'ok' : 'nope');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  received = [];
  respond = () => 200;
  tenant = await makeTenant();
  admin = await makeUser(tenant, 'company_admin');
  await CatalogProduct.create({ sku: 'SM-MUG-1', name: 'Mug', basePriceInr: 250 });
  liveKey = await createApiKey({ tenantId: tenant._id, name: 'Live', mode: 'live' });
  testKey = await createApiKey({ tenantId: tenant._id, name: 'Test', mode: 'test' });
});

describe('signatures', () => {
  it('round-trips and rejects tampering, wrong secrets and stale timestamps', () => {
    const body = JSON.stringify({ id: 'evt_1' });
    const { header } = signPayload('whsec_a', body);
    expect(verifySignature('whsec_a', body, header)).toBe(true);
    expect(verifySignature('whsec_a', `${body} `, header)).toBe(false);
    expect(verifySignature('whsec_b', body, header)).toBe(false);
    const old = signPayload('whsec_a', body, Math.floor(Date.now() / 1000) - 3600).header;
    expect(verifySignature('whsec_a', body, old)).toBe(false);
  });

  it('matches the documented Node verification snippet', () => {
    const body = '{"type":"order.shipped"}';
    const { header } = signPayload('whsec_doc', body);
    // --- docs snippet ---
    const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
    const expected = crypto.createHmac('sha256', 'whsec_doc').update(`${t}.${body}`).digest('hex');
    const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)) && Math.abs(Date.now() / 1000 - Number(t)) < 300;
    // ---
    expect(valid).toBe(true);
  });
});

describe('order lifecycle webhooks', () => {
  it('delivers signed received → in_production → shipped events for a test order', async () => {
    const { endpoint, secret } = await addEndpoint({ url: `${baseUrl}/hooks`, mode: 'test' });
    expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    await addEndpoint({ url: `${baseUrl}/live-only`, mode: 'live' });

    const order = (await createOrder(testKey.token)).body;
    await waitFor(() => received.length >= 1);
    await request(app).post(`/api/public/v1/orders/${order.id}/simulate`).set('Authorization', `Bearer ${testKey.token}`).send({ status: 'shipped' });
    await waitFor(() => received.length >= 3);

    expect(received.every((r) => r.path === '/hooks')).toBe(true); // live endpoint got nothing
    // Deliveries run concurrently, so arrival order is not guaranteed (documented for receivers).
    const events = received.map((r) => JSON.parse(r.body));
    const byType = Object.fromEntries(events.map((e) => [e.type, e]));
    expect(Object.keys(byType).sort()).toEqual(['order.in_production', 'order.received', 'order.shipped']);
    expect(new Set(events.map((e) => e.id)).size).toBe(3);
    expect(byType['order.received']).toMatchObject({ object: 'event', livemode: false, data: { object: { id: order.id, external_id: order.external_id, status: 'received' } } });
    expect(byType['order.shipped'].data.object).toMatchObject({ status: 'shipped', tracking: { awb: expect.stringMatching(/^TEST/) } });

    for (const r of received) {
      expect(verifySignature(secret, r.body, r.headers['shelfmerch-signature'])).toBe(true);
      expect(r.headers['shelfmerch-event-id']).toBe(JSON.parse(r.body).id);
      expect(r.headers['shelfmerch-event-type']).toBe(JSON.parse(r.body).type);
    }
    const deliveries = await WebhookDelivery.find({ tenantId: tenant._id, endpointId: endpoint.id }).lean();
    expect(deliveries.map((d) => d.status)).toEqual(['succeeded', 'succeeded', 'succeeded']);
  });

  it('fires from any status path (ops transition), honours event filters, and emits order.updated', async () => {
    await addEndpoint({ url: `${baseUrl}/shipped-only`, mode: 'live', events: ['order.shipped', 'order.updated'] });
    const created = (await createOrder(liveKey.token)).body;

    await request(app).patch(`/api/public/v1/orders/${created.id}`).set('Authorization', `Bearer ${liveKey.token}`).send({ notes: 'leave at gate' });
    await waitFor(() => received.length >= 1);
    expect(JSON.parse(received[0].body).type).toBe('order.updated');

    // An ops-side transition: not through the API at all.
    const order = await Order.findOne({ _id: created.id, tenantId: tenant._id });
    for (const s of ['approved', 'in_production', 'qc_pending', 'packed', 'shipped']) {
      transitionState('order', order, s, null, 'ops');
      await order.save();
    }
    await waitFor(() => received.length >= 2);
    await new Promise((r) => setTimeout(r, 100));
    expect(received.map((r) => JSON.parse(r.body).type)).toEqual(['order.updated', 'order.shipped']);
  });
});

describe('retries and endpoint health', () => {
  it('retries a failing delivery on schedule and succeeds once the receiver recovers', async () => {
    const { endpoint } = await addEndpoint({ url: `${baseUrl}/flaky`, mode: 'test' });
    respond = () => 503;
    await createOrder(testKey.token);
    await waitFor(() => received.length >= 1);
    await new Promise((r) => setTimeout(r, 50));

    let d = await WebhookDelivery.findOne({ tenantId: tenant._id, endpointId: endpoint.id }).lean();
    expect(d).toMatchObject({ status: 'pending', attempts: 1, responseStatus: 503, error: 'HTTP 503', responseSnippet: 'nope' });
    expect(d.nextAttemptAt.getTime() - d.lastAttemptAt.getTime()).toBe(60_000);

    // Not due yet → sweep skips it.
    expect((await sweepDueDeliveries()).attempted).toBe(0);

    respond = () => 200;
    await sweepDueDeliveries({ now: new Date(Date.now() + 61_000) });
    d = await WebhookDelivery.findOne({ _id: d._id, tenantId: tenant._id }).lean();
    expect(d).toMatchObject({ status: 'succeeded', attempts: 2 });
    const ep = await WebhookEndpoint.findOne({ _id: endpoint.id, tenantId: tenant._id }).lean();
    expect(ep).toMatchObject({ consecutiveFailures: 0, failingSince: null });
    // Same event id on the retry, so receivers can dedupe.
    expect(new Set(received.map((r) => r.headers['shelfmerch-event-id'])).size).toBe(1);
  });

  it('disables an endpoint that has been failing for 3 days', async () => {
    const { endpoint } = await addEndpoint({ url: `${baseUrl}/dead`, mode: 'test' });
    await WebhookEndpoint.updateOne(
      { _id: endpoint.id, tenantId: tenant._id },
      { $set: { failingSince: new Date(Date.now() - 4 * 24 * 3600 * 1000), consecutiveFailures: 40 } },
    );
    respond = () => 500;
    await createOrder(testKey.token);
    await waitFor(() => received.length >= 1);
    await new Promise((r) => setTimeout(r, 100));
    const ep = await WebhookEndpoint.findOne({ _id: endpoint.id, tenantId: tenant._id }).lean();
    expect(ep.enabled).toBe(false);
    expect(ep.disabledReason).toMatch(/3 days/);
  });
});

describe('endpoint management', () => {
  it('test event, reveal/rotate secret, delivery log and resend', async () => {
    const { endpoint, secret } = await addEndpoint({ url: `${baseUrl}/mgmt`, mode: 'live' });
    const list = await request(app).get('/api/v1/developers/webhooks').set('Authorization', `Bearer ${admin.token}`);
    expect(JSON.stringify(list.body)).not.toContain(secret);

    const test = await request(app).post(`/api/v1/developers/webhooks/${endpoint.id}/test`).set('Authorization', `Bearer ${admin.token}`);
    expect(test.body).toMatchObject({ status: 'succeeded', eventType: 'webhook.test', responseStatus: 200 });

    const reveal = await request(app).post(`/api/v1/developers/webhooks/${endpoint.id}/reveal-secret`).set('Authorization', `Bearer ${admin.token}`);
    expect(reveal.body.secret).toBe(secret);
    const rotated = await request(app).post(`/api/v1/developers/webhooks/${endpoint.id}/rotate-secret`).set('Authorization', `Bearer ${admin.token}`);
    expect(rotated.body.secret).not.toBe(secret);

    const log = await request(app).get(`/api/v1/developers/webhooks/${endpoint.id}/deliveries`).set('Authorization', `Bearer ${admin.token}`);
    expect(log.body).toMatchObject({ total: 1, page: 1, limit: 25 });
    const resend = await request(app).post(`/api/v1/developers/webhook-deliveries/${log.body.items[0]._id}/resend`).set('Authorization', `Bearer ${admin.token}`);
    expect(resend.body).toMatchObject({ status: 'succeeded', eventPublicId: log.body.items[0].eventPublicId });
    // The resend was signed with the rotated secret.
    expect(verifySignature(rotated.body.secret, received.at(-1).body, received.at(-1).headers['shelfmerch-signature'])).toBe(true);
  });

  it('rejects non-http(s) URLs', async () => {
    const res = await request(app).post('/api/v1/developers/webhooks').set('Authorization', `Bearer ${admin.token}`).send({ url: 'ftp://x.example/h', mode: 'live' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SOURCE_URL_INVALID');
  });
});
