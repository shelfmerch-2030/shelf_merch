import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import * as envModule from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { SkuMapping } from '../src/modules/orderSources/skuMapping.model.js';
import { OrderSourceConnection } from '../src/modules/orderSources/orderSourceConnection.model.js';
import { encryptCredentials } from '../src/modules/orderSources/orderSourceSync.service.js';
import { customRestConfigSchema } from '../src/modules/orderSources/adapters/customRest.config.js';
import { createApiKey } from '../src/modules/apiKeys/apiKeys.service.js';
import { indexCatalog, matchRow, nameTokens, productTypes, scorePair } from '../src/modules/catalogMatching/catalogMatch.engine.js';
import { parseCatalogFile } from '../src/modules/catalogMatching/catalogMatch.sources.js';

const CATALOG = [
  {
    sku: 'APRN-1007',
    name: 'Sustainable Crew Neck T-Shirt',
    brand: 'ShelfWear',
    category: 'Apparel',
    material: 'Organic Cotton',
    basePriceInr: 392,
    variants: [
      { size: 'L', color: 'Midnight Navy', sku: 'APRN-1007-NAV-L' },
      { size: 'XXL', color: 'Black', sku: 'APRN-1007-BLK-XXL' },
    ],
  },
  { sku: 'SM-POLO-001', name: 'ProWear Polo', brand: 'ProWear', category: 'Apparel', basePriceInr: 399, variants: [{ size: 'M', color: 'Maroon', sku: 'SM-POLO-001-MAR-M' }] },
  { sku: 'MUG-11OZ', name: 'Ceramic Coffee Mug 11oz', category: 'Drinkware', basePriceInr: 199 },
  { sku: 'BTL-750', name: 'Steel Water Bottle 750ml', category: 'Drinkware', basePriceInr: 499 },
  { sku: 'HD-200', name: 'Classic Pullover Hoodie', brand: 'ShelfWear', category: 'Apparel', basePriceInr: 899 },
  { sku: 'HD-201', name: 'Classic Zip Hoodie', brand: 'ShelfWear', category: 'Apparel', basePriceInr: 949 },
];

const CSV = [
  'SKU,Barcode,Product Name,Brand,Size,Colour,Material',
  'C-1,,Sustainable Crew Neck Tee,ShelfWear,L,Midnight Navy,Organic Cotton', // auto (strong name+brand+type+material)
  'C-2,APRN-1007-BLK-XXL,Whatever name,,,,', // auto via barcode = variant SKU
  'SM-POLO-001,,ProWear Polo,,M,Maroon,', // auto via exact SKU
  'C-4,,Coffee Mug,,,,', // review (partial name)
  'C-5,,Classic Hoodie,ShelfWear,,,', // review: pullover vs zip equally likely
  'C-6,,Bamboo Toothbrush,,,,', // no match
  'C-7,,Sustainable Crew Neck Tee,ShelfWear,S,Pink,', // review: variant missing
  ',,No SKU row,,,,', // invalid
].join('\n');

describe('engine', () => {
  const index = indexCatalog(CATALOG.map((p, i) => ({ ...p, _id: `p${i}` })));

  it('normalises product types and strips colour/size from names', () => {
    expect([...productTypes('Logo Tee - Black')]).toEqual(['tshirt']);
    expect([...productTypes('Steel Sipper')]).toEqual(['bottle']);
    expect(nameTokens('Sustainable Crew Neck Tee Midnight Navy L', { color: 'Midnight Navy', size: 'L' })).toEqual(['sustainable', 'tshirt']);
  });

  it('scores exact identifiers as 1 and pins the variant', () => {
    const r = scorePair({ sku: 'x', barcode: 'APRN-1007-BLK-XXL' }, index[0]);
    expect(r).toMatchObject({ score: 1, exact: true, variant: { size: 'XXL', color: 'Black' } });
  });

  it('penalises a different product type', () => {
    const tee = scorePair({ name: 'Crew Neck Tee' }, index[0]);
    const mug = scorePair({ name: 'Crew Neck Tee' }, index[2]);
    expect(tee.score).toBeGreaterThan(mug.score + 0.3);
    expect(mug.reasons).toContain('different product type');
  });

  it('decides auto / review / no_match with reasons', () => {
    expect(matchRow({ sku: 'C-1', name: 'Sustainable Crew Neck Tee', brand: 'ShelfWear', size: 'L', color: 'Midnight Navy', material: 'Organic Cotton' }, index)).toMatchObject({ decision: 'auto_mapped' });
    expect(matchRow({ sku: 'C-5', name: 'Classic Hoodie', brand: 'ShelfWear' }, index)).toMatchObject({ decision: 'review', reviewReason: expect.stringMatching(/equally likely|below/) });
    expect(matchRow({ sku: 'C-7', name: 'Sustainable Crew Neck Tee', brand: 'ShelfWear', size: 'S', color: 'Pink' }, index)).toMatchObject({ decision: 'review', reviewReason: expect.stringContaining('variant not found') });
    expect(matchRow({ sku: 'C-6', name: 'Bamboo Toothbrush' }, index)).toMatchObject({ decision: 'no_match' });
  });
});

describe('CSV parsing', () => {
  it('maps header aliases and rejects files without SKU', () => {
    const rows = parseCatalogFile(Buffer.from(CSV), 'catalog.csv');
    expect(rows[0]).toMatchObject({ sku: 'C-1', name: 'Sustainable Crew Neck Tee', brand: 'ShelfWear', size: 'L', color: 'Midnight Navy', material: 'Organic Cotton' });
    expect(() => parseCatalogFile(Buffer.from('Name,Price\nTee,1'), 'x.csv')).toThrow(/No SKU column/);
  });
});

let app;
let tenant;
let platform;
let admin;

beforeAll(async () => {
  await connectTestDb();
  envModule.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  app = createApp();
});
afterAll(disconnectTestDb);
afterEach(() => vi.restoreAllMocks());

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant();
  platform = await makeUser(null, 'platform_super_admin', 'platform');
  admin = await makeUser(tenant, 'company_admin');
  await CatalogProduct.insertMany(CATALOG);
});

function upload(token, path, fields = {}) {
  let req = request(app).post(path).set('Authorization', `Bearer ${token}`);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req.attach('file', Buffer.from(CSV), 'catalog.csv');
}

describe('bulk matching (ops)', () => {
  it('auto-maps, suggests and reports; never overwrites; accept/reject/undo work', async () => {
    const polo = await CatalogProduct.findOne({ sku: 'SM-POLO-001' }).lean();
    // Pre-existing manual mapping must survive.
    await SkuMapping.create({ tenantId: tenant._id, connectionId: null, externalSku: 'C-6', catalogProductId: polo._id });

    const res = await upload(platform.token, '/api/v1/platform/catalog-match/runs', { tenantId: String(tenant._id) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'completed',
      source: 'csv',
      counts: { scanned: 8, autoMapped: 3, review: 3, noMatch: 0, alreadyMapped: 1, invalid: 1 },
    });
    const runId = res.body._id;

    const maps = await SkuMapping.find({ tenantId: tenant._id, createdByRunId: runId }).lean();
    expect(maps.map((m) => m.externalSku).sort()).toEqual(['C-1', 'C-2', 'SM-POLO-001']);
    const c1 = maps.find((m) => m.externalSku === 'C-1');
    expect(c1.variant).toEqual({ size: 'L', color: 'Midnight Navy' }); // pinned: client row names a variant

    const review = await request(app)
      .get(`/api/v1/platform/catalog-match/runs/${runId}/items?status=review&tenantId=${tenant._id}`)
      .set('Authorization', `Bearer ${platform.token}`);
    expect(review.body.total).toBe(3);
    const hoodie = review.body.items.find((i) => i.client.sku === 'C-5');
    expect(hoodie.candidates.map((c) => c.sku).sort()).toEqual(['HD-200', 'HD-201']);

    // Accept a specific candidate.
    const hd201 = hoodie.candidates.find((c) => c.sku === 'HD-201');
    const accepted = await request(app)
      .post(`/api/v1/platform/catalog-match/items/${hoodie._id}/accept?tenantId=${tenant._id}`)
      .set('Authorization', `Bearer ${platform.token}`)
      .send({ catalogProductId: hd201.catalogProductId });
    expect(accepted.body.status).toBe('accepted');
    expect(await SkuMapping.findOne({ tenantId: tenant._id, connectionId: null, externalSku: 'C-5' }).lean()).toMatchObject({ catalogProductId: expect.anything() });

    // Reject one.
    const mugItem = review.body.items.find((i) => i.client.sku === 'C-4');
    const rejected = await request(app)
      .post(`/api/v1/platform/catalog-match/items/${mugItem._id}/reject?tenantId=${tenant._id}`)
      .set('Authorization', `Bearer ${platform.token}`);
    expect(rejected.body.status).toBe('rejected');

    // Pre-existing mapping untouched.
    expect(String((await SkuMapping.findOne({ tenantId: tenant._id, externalSku: 'C-6' }).lean()).catalogProductId)).toBe(String(polo._id));

    // Undo removes only the run's auto-mappings; the accepted one stays.
    const undo = await request(app)
      .post(`/api/v1/platform/catalog-match/runs/${runId}/undo?tenantId=${tenant._id}`)
      .set('Authorization', `Bearer ${platform.token}`);
    expect(undo.body.removedMappings).toBe(3);
    expect(await SkuMapping.exists({ tenantId: tenant._id, externalSku: 'C-1' })).toBeNull();
    expect(await SkuMapping.exists({ tenantId: tenant._id, externalSku: 'C-5' })).toBeTruthy();
  });

  it('a mapped SKU then resolves in a public API order', async () => {
    await upload(platform.token, '/api/v1/platform/catalog-match/runs', { tenantId: String(tenant._id) });
    const key = await createApiKey({ tenantId: tenant._id, name: 'k', mode: 'test' });
    const res = await request(app)
      .post('/api/public/v1/orders')
      .set('Authorization', `Bearer ${key.token}`)
      .set('Idempotency-Key', 'cm-1')
      .send({
        external_id: 'CM-1',
        shipping_address: { name: 'A', phone: '9876543210', line1: 'x', city: 'Pune', state: 'MH', pincode: '411001' },
        items: [{ sku: 'C-1', quantity: 1 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({ sku: 'APRN-1007-NAV-L', size: 'L', color: 'Midnight Navy' });
  });

  it('bulk-accepts suggestions whose variant fits', async () => {
    const run = (await upload(platform.token, '/api/v1/platform/catalog-match/runs', { tenantId: String(tenant._id) })).body;
    const res = await request(app)
      .post(`/api/v1/platform/catalog-match/runs/${run._id}/accept-suggestions?tenantId=${tenant._id}`)
      .set('Authorization', `Bearer ${platform.token}`)
      .send({ minScore: 0.6 });
    // C-4 mug accepted; C-5 (pullover vs zip equally likely) and C-7 (no S/Pink variant) need a person.
    expect(res.body).toEqual({ accepted: 1, skipped: 2 });
    expect(await SkuMapping.exists({ tenantId: tenant._id, externalSku: 'C-4' })).toBeTruthy();
    expect(await SkuMapping.exists({ tenantId: tenant._id, externalSku: 'C-5' })).toBeNull();
  });

  it('reads the catalog from a custom API connection', async () => {
    const config = customRestConfigSchema.parse({
      baseUrl: 'https://api.client.example',
      auth: { type: 'bearer' },
      products: { path: '/v1/products', itemsPath: 'data', fields: { sku: 'code', name: 'title', variants: 'variants', variantSku: 'code' } },
    });
    const conn = await OrderSourceConnection.create({
      tenantId: tenant._id,
      provider: 'custom_rest',
      name: 'Client API',
      shopDomain: 'api.client.example',
      config,
      encryptedCredentials: encryptCredentials({ token: 't' }),
    });
    const conns = await request(app)
      .get(`/api/v1/platform/catalog-match/connections?tenantId=${tenant._id}`)
      .set('Authorization', `Bearer ${platform.token}`);
    expect(conns.body.items).toEqual([expect.objectContaining({ name: 'Client API', productsPath: '/v1/products' })]);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ data: [{ code: 'P-1', title: 'ProWear Polo', variants: [{ code: 'P-1-M', size: 'M', color: 'Maroon' }] }] }), { status: 200 }),
    );
    const res = await request(app)
      .post('/api/v1/platform/catalog-match/runs')
      .set('Authorization', `Bearer ${platform.token}`)
      .send({ tenantId: String(tenant._id), connectionId: String(conn._id), source: 'custom_api' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ source: 'custom_api', counts: { scanned: 1 } });
    const item = (await request(app)
      .get(`/api/v1/platform/catalog-match/runs/${res.body._id}/items?tenantId=${tenant._id}`)
      .set('Authorization', `Bearer ${platform.token}`)).body.items[0];
    expect(item.client).toMatchObject({ sku: 'P-1-M', size: 'M', color: 'Maroon' });
    expect(item.candidates[0].sku).toBe('SM-POLO-001');
  });
});

describe('bulk matching (client self-serve)', () => {
  it('company admin runs a CSV for tenant-wide mappings; API source is not allowed; managers are denied', async () => {
    const res = await upload(admin.token, '/api/v1/developers/catalog-match/runs');
    expect(res.status).toBe(201);
    expect(res.body.connectionId).toBeNull();
    expect(res.body.counts.autoMapped).toBe(3);

    const api = await request(app).post('/api/v1/developers/catalog-match/runs').set('Authorization', `Bearer ${admin.token}`).send({ source: 'custom_api' });
    expect(api.status).toBe(400);

    const manager = await makeUser(tenant, 'entity_manager');
    const denied = await request(app).get('/api/v1/developers/catalog-match/runs').set('Authorization', `Bearer ${manager.token}`);
    expect(denied.status).toBe(403);
  });
});
