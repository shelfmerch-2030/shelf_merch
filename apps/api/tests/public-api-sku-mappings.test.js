import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant } from './helpers.js';
import * as envModule from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { createApiKey } from '../src/modules/apiKeys/apiKeys.service.js';
import { SkuMapping } from '../src/modules/orderSources/skuMapping.model.js';
import { CatalogMatchRun } from '../src/modules/catalogMatching/catalogMatch.models.js';

let app;
let tenant;
let polo;
let token;

const ADDRESS = { name: 'A', phone: '9876543210', line1: 'x', city: 'Pune', state: 'MH', pincode: '411001' };
const auth = (r, t = token) => r.set('Authorization', `Bearer ${t}`);
const api = (path) => `/api/public/v1${path}`;

beforeAll(async () => {
  await connectTestDb();
  envModule.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant();
  polo = await CatalogProduct.create({
    sku: 'SM-POLO-001',
    name: 'ProWear Polo',
    basePriceInr: 399,
    variants: [
      { size: 'XXL', color: 'Maroon', sku: 'SM-POLO-001-MAR-XXL' },
      { size: 'M', color: 'Navy', sku: 'SM-POLO-001-NAV-M' },
    ],
  });
  await CatalogProduct.create({ sku: 'MUG-11OZ', name: 'Ceramic Mug', basePriceInr: 199 });
  await CatalogProduct.create({ sku: 'OLD-1', name: 'Retired Tee', basePriceInr: 1, status: 'archived' });
  token = (await createApiKey({ tenantId: tenant._id, name: 'k', mode: 'live' })).token;
});

describe('PUT/GET/DELETE /sku-mappings/{sku}', () => {
  it('creates (201), returns unchanged (200), replaces, reads and deletes', async () => {
    const created = await auth(request(app).put(api('/sku-mappings/ACME-TEE-1'))).send({ catalog_sku: 'SM-POLO-001' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ object: 'sku_mapping', sku: 'ACME-TEE-1', catalog_sku: 'SM-POLO-001', product_name: 'ProWear Polo', variant: null, artwork_url: null });

    const again = await auth(request(app).put(api('/sku-mappings/ACME-TEE-1'))).send({ catalog_sku: 'SM-POLO-001' });
    expect(again.status).toBe(200);

    // Variant SKU pins the variant; PUT replaces the whole mapping.
    const pinned = await auth(request(app).put(api('/sku-mappings/ACME-TEE-1'))).send({ catalog_sku: 'SM-POLO-001-MAR-XXL', artwork_url: 'https://cdn.example/logo.png' });
    expect(pinned.status).toBe(200);
    expect(pinned.body).toMatchObject({ variant: { size: 'XXL', color: 'Maroon' }, artwork_url: 'https://cdn.example/logo.png' });

    const got = await auth(request(app).get(api('/sku-mappings/ACME-TEE-1')));
    expect(got.body).toMatchObject({ sku: 'ACME-TEE-1', variant: { size: 'XXL' } });

    const del = await auth(request(app).delete(api('/sku-mappings/ACME-TEE-1')));
    expect(del.body).toEqual({ object: 'sku_mapping', sku: 'ACME-TEE-1', deleted: true });
    const gone = await auth(request(app).get(api('/sku-mappings/ACME-TEE-1')));
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe('sku_mapping_not_found');
  });

  it('normalises size spelling and rejects variants the product does not have', async () => {
    const ok = await auth(request(app).put(api('/sku-mappings/T-2XL'))).send({ catalog_sku: 'SM-POLO-001', size: '2XL', color: 'maroon' });
    expect(ok.body.variant).toEqual({ size: 'XXL', color: 'Maroon' });

    const missing = await auth(request(app).put(api('/sku-mappings/T-S'))).send({ catalog_sku: 'SM-POLO-001', size: 'S' });
    expect(missing.status).toBe(422);
    expect(missing.body.error).toMatchObject({ code: 'variant_not_found', param: 'size' });

    const clash = await auth(request(app).put(api('/sku-mappings/T-C'))).send({ catalog_sku: 'SM-POLO-001-NAV-M', size: 'XXL' });
    expect(clash.body.error.code).toBe('variant_conflict');

    for (const sku of ['NOPE', 'OLD-1']) {
      const r = await auth(request(app).put(api('/sku-mappings/X'))).send({ catalog_sku: sku });
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('catalog_sku_not_found');
    }
    const http = await auth(request(app).put(api('/sku-mappings/X'))).send({ catalog_sku: 'MUG-11OZ', artwork_url: 'http://insecure.example/a.png' });
    expect(http.status).toBe(400);
  });

  it('handles SKUs with slashes and spaces when URL-encoded', async () => {
    const sku = 'ACME/TEE 01';
    const r = await auth(request(app).put(api(`/sku-mappings/${encodeURIComponent(sku)}`))).send({ catalog_sku: 'MUG-11OZ' });
    expect(r.status).toBe(201);
    expect(r.body.sku).toBe(sku);
    expect((await auth(request(app).get(api(`/sku-mappings/${encodeURIComponent(sku)}`)))).body.sku).toBe(sku);
  });

  it('a PUT over a catalog-match auto-mapping detaches it from the run (undo keeps it)', async () => {
    const run = await CatalogMatchRun.create({ tenantId: tenant._id, source: 'csv' });
    await SkuMapping.create({ tenantId: tenant._id, connectionId: null, externalSku: 'AUTO-1', catalogProductId: polo._id, createdByRunId: run._id });
    await auth(request(app).put(api('/sku-mappings/AUTO-1'))).send({ catalog_sku: 'MUG-11OZ' });
    expect((await SkuMapping.findOne({ tenantId: tenant._id, externalSku: 'AUTO-1' }).lean()).createdByRunId).toBeNull();
  });
});

describe('POST /sku-mappings/bulk', () => {
  it('applies valid rows and reports each row independently', async () => {
    await SkuMapping.create({ tenantId: tenant._id, connectionId: null, externalSku: 'SAME', catalogProductId: polo._id });
    const res = await auth(request(app).post(api('/sku-mappings/bulk'))).send({
      mappings: [
        { sku: 'NEW-1', catalog_sku: 'MUG-11OZ' },
        { sku: 'SAME', catalog_sku: 'SM-POLO-001' },
        { sku: 'VAR-1', catalog_sku: 'SM-POLO-001-NAV-M' },
        { sku: 'BAD-1', catalog_sku: 'NOPE' },
        { sku: 'DUP', catalog_sku: 'MUG-11OZ' },
        { sku: 'DUP', catalog_sku: 'SM-POLO-001' },
        { catalog_sku: 'MUG-11OZ' },
        { sku: 'EXTRA', catalog_sku: 'MUG-11OZ', price: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ created: 2, updated: 0, unchanged: 1, failed: 5 });
    expect(res.body.data.map((d) => [d.sku, d.result, d.error?.code])).toEqual([
      ['NEW-1', 'created', undefined],
      ['SAME', 'unchanged', undefined],
      ['VAR-1', 'created', undefined],
      ['BAD-1', 'failed', 'catalog_sku_not_found'],
      ['DUP', 'failed', 'duplicate_sku'],
      ['DUP', 'failed', 'duplicate_sku'],
      [null, 'failed', 'invalid_row'],
      ['EXTRA', 'failed', 'invalid_row'],
    ]);
    expect(res.body.data[2].mapping.variant).toEqual({ size: 'M', color: 'Navy' });

    // Re-sending is safe.
    const again = await auth(request(app).post(api('/sku-mappings/bulk'))).send({ mappings: [{ sku: 'NEW-1', catalog_sku: 'MUG-11OZ' }, { sku: 'NEW-1B', catalog_sku: 'MUG-11OZ' }] });
    expect(again.body.summary).toEqual({ created: 1, updated: 0, unchanged: 1, failed: 0 });
  });

  it('handles 1,000 rows in one request', async () => {
    const mappings = Array.from({ length: 1000 }, (_, i) => ({ sku: `BULK-${String(i).padStart(4, '0')}`, catalog_sku: i % 2 ? 'MUG-11OZ' : 'SM-POLO-001-MAR-XXL' }));
    const res = await auth(request(app).post(api('/sku-mappings/bulk'))).send({ mappings });
    expect(res.body.summary).toEqual({ created: 1000, updated: 0, unchanged: 0, failed: 0 });
    expect(await SkuMapping.countDocuments({ tenantId: tenant._id })).toBe(1000);

    const tooMany = await auth(request(app).post(api('/sku-mappings/bulk'))).send({ mappings: [...mappings, { sku: 'X', catalog_sku: 'MUG-11OZ' }] });
    expect(tooMany.status).toBe(400);
  });
});

describe('listing, scopes and order resolution', () => {
  it('pages by SKU with a cursor', async () => {
    await auth(request(app).post(api('/sku-mappings/bulk'))).send({ mappings: ['C', 'A', 'B'].map((sku) => ({ sku, catalog_sku: 'MUG-11OZ' })) });
    const p1 = await auth(request(app).get(api('/sku-mappings?limit=2')));
    expect(p1.body).toMatchObject({ object: 'list', has_more: true, next_cursor: 'B' });
    expect(p1.body.data.map((d) => d.sku)).toEqual(['A', 'B']);
    const p2 = await auth(request(app).get(api(`/sku-mappings?limit=2&starting_after=${p1.body.next_cursor}`)));
    expect(p2.body).toMatchObject({ has_more: false, next_cursor: null });
    expect(p2.body.data.map((d) => d.sku)).toEqual(['C']);
  });

  it('requires the sku_mappings scopes and keeps tenants apart', async () => {
    const ordersOnly = (await createApiKey({ tenantId: tenant._id, name: 'o', mode: 'live', scopes: ['orders:write', 'orders:read'] })).token;
    const denied = await auth(request(app).put(api('/sku-mappings/X')), ordersOnly).send({ catalog_sku: 'MUG-11OZ' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('insufficient_scope');
    const readOnly = (await createApiKey({ tenantId: tenant._id, name: 'r', mode: 'live', scopes: ['sku_mappings:read'] })).token;
    expect((await auth(request(app).get(api('/sku-mappings')), readOnly)).status).toBe(200);
    expect((await auth(request(app).delete(api('/sku-mappings/X')), readOnly)).status).toBe(403);

    await auth(request(app).put(api('/sku-mappings/MINE'))).send({ catalog_sku: 'MUG-11OZ' });
    const other = await makeTenant();
    const otherToken = (await createApiKey({ tenantId: other._id, name: 'k', mode: 'live' })).token;
    expect((await auth(request(app).get(api('/sku-mappings/MINE')), otherToken)).status).toBe(404);
  });

  it('an order sent with the client SKU is made as the mapped product', async () => {
    await auth(request(app).put(api('/sku-mappings/ACME-POLO-XXL'))).send({ catalog_sku: 'SM-POLO-001-MAR-XXL' });
    const res = await auth(request(app).post(api('/orders')))
      .set('Idempotency-Key', 'sm-1')
      .send({ external_id: 'SM-1', shipping_address: ADDRESS, items: [{ sku: 'ACME-POLO-XXL', quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({ sku: 'SM-POLO-001-MAR-XXL', size: 'XXL', color: 'Maroon', quantity: 2 });
  });
});
