import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import * as envModule from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { ApiKey } from '../src/modules/apiKeys/apiKey.model.js';
import { createApiKey, parseToken } from '../src/modules/apiKeys/apiKeys.service.js';
import { SkuMapping } from '../src/modules/orderSources/skuMapping.model.js';
import { publicStatus } from '../src/modules/publicApi/publicOrder.serializer.js';

let app;
let tenant;
let product;
let collection;
let liveKey;
let testKey;

const ADDRESS = {
  name: 'Husain',
  phone: '8341077173',
  line1: '164 Rajeev Nagar, Sector 10',
  city: 'Lucknow',
  state: 'Uttar Pradesh',
  pincode: '226016',
  country: 'India',
};

function order(overrides = {}) {
  return {
    external_id: 'ORD-1001',
    customer: { name: 'Husain', email: 'husain@example.com' },
    shipping_address: ADDRESS,
    items: [{ sku: 'SM-POLO-001', quantity: 2, size: '2XL', color: 'Maroon' }],
    metadata: { storefront_order: '6b05409abfc5' },
    ...overrides,
  };
}

let keyN = 0;
function post(token, body, key = `idem-${++keyN}`) {
  return request(app)
    .post('/api/public/v1/orders')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send(body);
}

beforeAll(async () => {
  await connectTestDb();
  envModule.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant();
  product = await CatalogProduct.create({
    sku: 'SM-POLO-001',
    name: 'ProWear Polo',
    basePriceInr: 399,
    costPriceInr: 180,
    gstRate: 5,
    variants: [
      { size: 'XXL', color: 'Maroon', sku: 'SM-POLO-001-MAR-XXL' },
      { size: 'M', color: 'Navy', sku: 'SM-POLO-001-NAV-M' },
    ],
  });
  collection = await Collection.create({
    tenantId: tenant._id,
    code: 'C1',
    name: 'Acme Merch',
    status: 'ready',
    artworkUrl: 'https://cdn.example.com/acme-logo.png',
    productRefs: [{ catalogProductId: product._id, name: 'Acme Polo', mockupUrl: 'https://cdn.example.com/acme-polo.png' }],
  });
  liveKey = await createApiKey({ tenantId: tenant._id, name: 'Storefront', mode: 'live' });
  testKey = await createApiKey({ tenantId: tenant._id, name: 'Sandbox', mode: 'test' });
});

describe('API keys', () => {
  it('stores only a hash and verifies the token', async () => {
    expect(liveKey.token).toMatch(/^smk_live_[0-9a-f]{16}_[0-9a-f]{48}$/);
    const stored = await ApiKey.findOne({ tenantId: tenant._id, name: 'Storefront' }).select('+secretHash').lean();
    expect(stored.secretHash).not.toContain(parseToken(liveKey.token).secret);
    expect(liveKey.apiKey.prefix).toMatch(/^smk_live_[0-9a-f]{16}_…[0-9a-f]{4}$/);

    const ok = await request(app).get('/api/public/v1/orders').set('Authorization', `Bearer ${liveKey.token}`);
    expect(ok.status).toBe(200);
  });

  it('rejects missing, malformed, wrong-secret and revoked keys with the public envelope', async () => {
    const missing = await request(app).get('/api/public/v1/orders');
    expect(missing.status).toBe(401);
    expect(missing.body.error).toMatchObject({ type: 'authentication_error', code: 'api_key_missing' });
    expect(missing.body.error.request_id).toBeTruthy();

    const bad = liveKey.token.slice(0, -1) + (liveKey.token.endsWith('0') ? '1' : '0');
    const wrong = await request(app).get('/api/public/v1/orders').set('Authorization', `Bearer ${bad}`);
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('api_key_invalid');

    const modeSwap = liveKey.token.replace('smk_live_', 'smk_test_');
    expect((await request(app).get('/api/public/v1/orders').set('Authorization', `Bearer ${modeSwap}`)).status).toBe(401);

    await ApiKey.updateOne({ tenantId: tenant._id, name: 'Storefront' }, { $set: { revokedAt: new Date() } });
    const revoked = await request(app).get('/api/public/v1/orders').set('Authorization', `Bearer ${liveKey.token}`);
    expect(revoked.body.error.code).toBe('api_key_revoked');
  });

  it('enforces scopes', async () => {
    const readOnly = await createApiKey({ tenantId: tenant._id, name: 'Reader', mode: 'live', scopes: ['orders:read'] });
    const res = await post(readOnly.token, order());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ type: 'permission_error', code: 'insufficient_scope' });
  });
});

describe('POST /orders', () => {
  it('creates an order from a catalog SKU, matching 2XL to the XXL variant', async () => {
    const res = await post(liveKey.token, order());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      object: 'order',
      external_id: 'ORD-1001',
      status: 'received',
      test: false,
      shipping_address: { pincode: '226016', country: 'IN' },
      items: [{ sku: 'SM-POLO-001-MAR-XXL', quantity: 2, size: 'XXL', color: 'Maroon', unit_price: 399 }],
      amounts: { total: 798, currency: 'INR' },
      metadata: { storefront_order: '6b05409abfc5' },
    });
    expect(res.body.number).toMatch(/^SM-\d{4}-\d{6}$/);
    expect(JSON.stringify(res.body)).not.toContain('180'); // cost price never leaks

    const saved = await Order.findOne({ tenantId: tenant._id });
    expect(saved.source).toBe('api');
    expect(saved.apiRef.externalId).toBe('ORD-1001');
  });

  it('a branded listing id carries the tenant artwork and mockup', async () => {
    const sku = `${collection._id}:${product._id}`;
    const res = await post(liveKey.token, order({ items: [{ sku, quantity: 1, size: 'M', color: 'Navy' }] }));
    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({
      name: 'Acme Polo',
      artwork_url: 'https://cdn.example.com/acme-logo.png',
      image_url: 'https://cdn.example.com/acme-polo.png',
      size: 'M',
    });
    const saved = await Order.findOne({ tenantId: tenant._id });
    expect(String(saved.items[0].collectionId)).toBe(String(collection._id));
  });

  it("a tenant-wide mapping resolves the client's own SKU", async () => {
    await SkuMapping.create({ tenantId: tenant._id, connectionId: null, externalSku: '6a22a6ca17f50a837a9d6035', catalogProductId: product._id });
    const res = await post(liveKey.token, order({ items: [{ sku: '6a22a6ca17f50a837a9d6035', quantity: 1, size: '2XL', color: 'Maroon' }] }));
    expect(res.status).toBe(201);
    expect(res.body.items[0].sku).toBe('SM-POLO-001-MAR-XXL');
  });

  it('returns per-field 422 details for unknown SKUs, missing variants and bad pincodes', async () => {
    const res = await post(
      liveKey.token,
      order({
        shipping_address: { ...ADDRESS, pincode: '2260' },
        items: [
          { sku: 'NOPE-1', quantity: 1 },
          { sku: 'SM-POLO-001', quantity: 1, size: 'S', color: 'Pink' },
        ],
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ type: 'invalid_request_error', code: 'validation_failed', param: 'shipping_address.pincode' });
    expect(res.body.error.details).toEqual([
      { param: 'shipping_address.pincode', code: 'invalid_pincode', message: 'Indian pincodes have 6 digits' },
      { param: 'items[0].sku', code: 'unknown_sku', message: expect.stringContaining('NOPE-1') },
      { param: 'items[1].sku', code: 'variant_unavailable', message: 'ProWear Polo is not available in S / Pink' },
    ]);
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('validates shape with params', async () => {
    const res = await post(liveKey.token, { external_id: 'x', items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details.map((d) => d.param)).toEqual(expect.arrayContaining(['shipping_address', 'items']));
  });

  it('requires an Idempotency-Key and replays the same response for a retry', async () => {
    const noKey = await request(app).post('/api/public/v1/orders').set('Authorization', `Bearer ${liveKey.token}`).send(order());
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe('idempotency_key_required');

    const first = await post(liveKey.token, order(), 'retry-me');
    const again = await post(liveKey.token, order(), 'retry-me');
    expect(again.status).toBe(201);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(again.body.id).toBe(first.body.id);
    expect(await Order.countDocuments({ tenantId: tenant._id })).toBe(1);
  });

  it('rejects a duplicate external_id with the existing order id (different idempotency key)', async () => {
    const first = await post(liveKey.token, order());
    const dup = await post(liveKey.token, order());
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'order_exists', param: 'external_id', details: [{ message: first.body.id }] });
  });

  it('keeps test and live orders apart', async () => {
    const live = await post(liveKey.token, order());
    const test = await post(testKey.token, order()); // same external_id is fine in the other mode
    expect(test.status).toBe(201);
    expect(test.body.test).toBe(true);

    const liveList = await request(app).get('/api/public/v1/orders').set('Authorization', `Bearer ${liveKey.token}`);
    expect(liveList.body.data.map((o) => o.id)).toEqual([live.body.id]);
    const cross = await request(app).get(`/api/public/v1/orders/${live.body.id}`).set('Authorization', `Bearer ${testKey.token}`);
    expect(cross.status).toBe(404);
  });

  it('never exposes another tenant', async () => {
    const other = await makeTenant();
    const otherKey = await createApiKey({ tenantId: other._id, name: 'Other', mode: 'live' });
    const mine = await post(liveKey.token, order());
    const res = await request(app).get(`/api/public/v1/orders/${mine.body.id}`).set('Authorization', `Bearer ${otherKey.token}`);
    expect(res.status).toBe(404);
  });
});

describe('reading, updating, cancelling', () => {
  it('gets by id or number, lists with cursor pagination and status filter', async () => {
    const ids = [];
    for (let i = 1; i <= 3; i += 1) ids.push((await post(liveKey.token, order({ external_id: `ORD-${i}` }))).body);
    const byNumber = await request(app).get(`/api/public/v1/orders/${ids[0].number}`).set('Authorization', `Bearer ${liveKey.token}`);
    expect(byNumber.body.id).toBe(ids[0].id);

    const page1 = await request(app).get('/api/public/v1/orders?limit=2').set('Authorization', `Bearer ${liveKey.token}`);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.has_more).toBe(true);
    const page2 = await request(app)
      .get(`/api/public/v1/orders?limit=2&starting_after=${page1.body.next_cursor}`)
      .set('Authorization', `Bearer ${liveKey.token}`);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.has_more).toBe(false);
    const all = [...page1.body.data, ...page2.body.data].map((o) => o.id).sort();
    expect(all).toEqual(ids.map((o) => o.id).sort());

    // Default page size applies even without ?limit (raw query values are coerced).
    const noLimit = await request(app).get('/api/public/v1/orders').set('Authorization', `Bearer ${liveKey.token}`);
    expect(noLimit.body).toMatchObject({ has_more: false, next_cursor: null });
    expect(noLimit.body.data).toHaveLength(3);

    const byExt = await request(app).get('/api/public/v1/orders?external_id=ORD-2').set('Authorization', `Bearer ${liveKey.token}`);
    expect(byExt.body.data.map((o) => o.external_id)).toEqual(['ORD-2']);
    const shipped = await request(app).get('/api/public/v1/orders?status=shipped').set('Authorization', `Bearer ${liveKey.token}`);
    expect(shipped.body.data).toEqual([]);
  });

  it('updates the address while received, then locks after production starts', async () => {
    const created = (await post(liveKey.token, order())).body;
    const upd = await request(app)
      .patch(`/api/public/v1/orders/${created.id}`)
      .set('Authorization', `Bearer ${liveKey.token}`)
      .send({ shipping_address: { line1: '99 Hazratganj' } });
    expect(upd.status).toBe(200);
    expect(upd.body.shipping_address).toMatchObject({ line1: '99 Hazratganj', city: 'Lucknow' });

    await Order.updateOne({ _id: created.id, tenantId: tenant._id }, { $set: { status: 'in_production' } });
    const locked = await request(app)
      .patch(`/api/public/v1/orders/${created.id}`)
      .set('Authorization', `Bearer ${liveKey.token}`)
      .send({ notes: 'gift wrap' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('order_locked');
  });

  it('cancels while received; refuses once in production', async () => {
    const a = (await post(liveKey.token, order({ external_id: 'A' }))).body;
    const cancel = await request(app).post(`/api/public/v1/orders/${a.id}/cancel`).set('Authorization', `Bearer ${liveKey.token}`).send({ reason: 'customer changed mind' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');

    const b = (await post(liveKey.token, order({ external_id: 'B' }))).body;
    await Order.updateOne({ _id: b.id, tenantId: tenant._id }, { $set: { status: 'packed' } });
    const refused = await request(app).post(`/api/public/v1/orders/${b.id}/cancel`).set('Authorization', `Bearer ${liveKey.token}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('order_not_cancellable');
  });

  it('simulate walks a test order to shipped with tracking; live keys cannot simulate', async () => {
    const t = (await post(testKey.token, order())).body;
    const sim = await request(app).post(`/api/public/v1/orders/${t.id}/simulate`).set('Authorization', `Bearer ${testKey.token}`).send({ status: 'shipped' });
    expect(sim.status).toBe(200);
    expect(sim.body.status).toBe('shipped');
    expect(sim.body.tracking.awb).toMatch(/^TEST/);
    const saved = await Order.findOne({ _id: t.id, tenantId: tenant._id });
    expect(saved.statusHistory.map((h) => h.status)).toEqual(['created', 'approved', 'in_production', 'qc_pending', 'packed', 'shipped']);

    const l = (await post(liveKey.token, order())).body;
    const denied = await request(app).post(`/api/public/v1/orders/${l.id}/simulate`).set('Authorization', `Bearer ${liveKey.token}`).send({ status: 'shipped' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('test_mode_only');
  });

  it('test orders stay out of the platform orders list', async () => {
    await post(testKey.token, order());
    const live = (await post(liveKey.token, order())).body;
    const platform = await makeUser(null, 'platform_super_admin', 'platform');
    const res = await request(app).get('/api/v1/platform/orders').set('Authorization', `Bearer ${platform.token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((o) => String(o._id))).toEqual([live.id]);
  });
});

describe('GET /products', () => {
  it('lists branded listings and mapped SKUs', async () => {
    await SkuMapping.create({ tenantId: tenant._id, connectionId: null, externalSku: 'CLIENT-1', catalogProductId: product._id });
    const res = await request(app).get('/api/public/v1/products').set('Authorization', `Bearer ${liveKey.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ type: 'listing', sku: `${collection._id}:${product._id}`, name: 'Acme Polo', has_artwork: true }),
      expect.objectContaining({ type: 'mapped', sku: 'CLIENT-1', name: 'ProWear Polo' }),
    ]);
    expect(res.body.data[0].variants).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain('costPrice');
  });

  it('pages the catalog with defaults when no page/limit is sent', async () => {
    const res = await request(app).get('/api/public/v1/products?type=catalog').set('Authorization', `Bearer ${liveKey.token}`);
    expect(res.body).toMatchObject({ page: 1, total: 1, has_more: false });
    expect(res.body.data[0]).toMatchObject({ sku: 'SM-POLO-001', type: 'catalog' });
  });
});

describe('developer settings (tenant)', () => {
  it('company admin creates, lists and revokes keys; entity managers cannot', async () => {
    const admin = await makeUser(tenant, 'company_admin');
    const created = await request(app)
      .post('/api/v1/developers/keys')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'ERP', mode: 'live' });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^smk_live_/);

    const list = await request(app).get('/api/v1/developers/keys').set('Authorization', `Bearer ${admin.token}`);
    expect(JSON.stringify(list.body)).not.toContain(parseToken(created.body.token).secret);
    expect(list.body.items.map((k) => k.name)).toContain('ERP');

    const revoked = await request(app).delete(`/api/v1/developers/keys/${created.body.apiKey.id}`).set('Authorization', `Bearer ${admin.token}`);
    expect(revoked.body.revokedAt).toBeTruthy();
    const use = await request(app).get('/api/public/v1/orders').set('Authorization', `Bearer ${created.body.token}`);
    expect(use.status).toBe(401);

    const manager = await makeUser(tenant, 'entity_manager');
    const denied = await request(app).get('/api/v1/developers/keys').set('Authorization', `Bearer ${manager.token}`);
    expect(denied.status).toBe(403);
  });
});

describe('rate limiting', () => {
  it('allows 120 requests a minute per key, then 429 with Retry-After in the public envelope', async () => {
    const statuses = [];
    for (let i = 0; i < 121; i += 1) {
      statuses.push((await request(app).get('/api/public/v1/products?type=mapped').set('Authorization', `Bearer ${liveKey.token}`)).status);
    }
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    const limited = await request(app).get('/api/public/v1/products?type=mapped').set('Authorization', `Bearer ${liveKey.token}`);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.body.error).toMatchObject({ type: 'rate_limit_error', code: 'rate_limited' });

    // Limits are per key: another key of the same tenant is unaffected.
    const other = await request(app).get('/api/public/v1/products?type=mapped').set('Authorization', `Bearer ${testKey.token}`);
    expect(other.status).toBe(200);
  }, 60_000);
});

describe('OpenAPI contract', () => {
  it('is served without a key and documents exactly the routes that exist', async () => {
    const res = await request(app).get('/api/public/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');

    const { publicApiRouter } = await import('../src/modules/publicApi/publicApi.routes.js');
    const toOpenApi = (p) => p.replace(/:(\w+)/g, '{$1}');
    const routes = publicApiRouter.stack
      .filter((l) => l.route && l.route.path !== '/openapi.json')
      .flatMap((l) => Object.keys(l.route.methods).map((m) => `${m} ${toOpenApi(l.route.path)}`))
      .sort();
    const documented = Object.entries(res.body.paths)
      .flatMap(([p, ops]) => Object.keys(ops).filter((k) => k !== 'parameters').map((m) => `${m} ${p}`))
      .sort();
    expect(documented).toEqual(routes);
    expect(Object.keys(res.body.webhooks)).toContain('order.shipped');
  });
});

describe('platform API access view', () => {
  it("lists a tenant's keys and lets a super admin revoke one", async () => {
    const platform = await makeUser(null, 'platform_super_admin', 'platform');
    const view = await request(app).get(`/api/v1/platform/api-access?tenantId=${tenant._id}`).set('Authorization', `Bearer ${platform.token}`);
    expect(view.status).toBe(200);
    expect(view.body.keys.map((k) => k.name).sort()).toEqual(['Sandbox', 'Storefront']);
    expect(JSON.stringify(view.body)).not.toContain(parseToken(liveKey.token).secret);

    const revoke = await request(app).post(`/api/v1/platform/api-access/keys/${liveKey.apiKey.id}/revoke`).set('Authorization', `Bearer ${platform.token}`);
    expect(revoke.status).toBe(200);
    const denied = await request(app).get('/api/public/v1/orders').set('Authorization', `Bearer ${liveKey.token}`);
    expect(denied.status).toBe(401);
  });
});

describe('status mapping', () => {
  it('maps internal statuses onto the public contract', () => {
    expect(['created', 'approved'].map(publicStatus)).toEqual(['received', 'received']);
    expect(['mockup_pending', 'qc_pending', 'packed'].map(publicStatus)).toEqual(['in_production', 'in_production', 'in_production']);
    expect(['issue_raised', 'replacement_processing'].map(publicStatus)).toEqual(['on_hold', 'on_hold']);
    expect(publicStatus('cancelled')).toBe('cancelled');
  });
});
