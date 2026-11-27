import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Deliveries are asserted as outbox rows; nothing is sent.
vi.mock('../src/jobs/queues.js', async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueWebhookDelivery: vi.fn(async () => ({ queued: true })),
}));

import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { makeTenant, makeUser } from './helpers.js';
import * as envModule from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Category } from '../src/modules/catalog/category.model.js';
import { createApiKey } from '../src/modules/apiKeys/apiKeys.service.js';
import { WebhookEndpoint, WebhookEvent, WebhookDelivery } from '../src/modules/webhooks/webhook.models.js';
import { encryptToken } from '../src/utils/tokenEncryption.js';
import { ImportedProduct } from '../src/modules/catalogSync/catalogSync.models.js';
import { sweepCatalogChanges } from '../src/modules/catalogSync/catalogChanges.service.js';

let app;
let tenant;
let token;
let tee;
let mug;
let old;

const ADDRESS = { name: 'A', phone: '9876543210', line1: 'x', city: 'Pune', state: 'MH', pincode: '411001' };
const api = (p) => `/api/public/v1${p}`;
const get = (p, t = token) => request(app).get(api(p)).set('Authorization', `Bearer ${t}`);
const post = (p, body, { t = token, idem } = {}) => {
  const r = request(app).post(api(p)).set('Authorization', `Bearer ${t}`);
  if (idem) r.set('Idempotency-Key', idem);
  return r.send(body);
};
const tick = () => new Promise((r) => setTimeout(r, 15)); // distinct updatedAt values

beforeAll(async () => {
  await connectTestDb();
  envModule.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant();
  token = (await createApiKey({ tenantId: tenant._id, name: 'k', mode: 'live' })).token;
  tee = await CatalogProduct.create({
    sku: 'APRN-1007',
    name: 'Sustainable Crew Neck',
    brand: 'ShelfWear',
    category: 'Apparel',
    subcategory: 'T-Shirts',
    basePriceInr: 392,
    costPriceInr: 150,
    supplierName: 'Secret Mills',
    material: 'Organic Cotton',
    primaryImageUrl: 'https://cdn.x/tee.png',
    imageUrls: ['https://cdn.x/tee.png', 'https://cdn.x/tee-back.png'],
    maskImageUrl: 'https://cdn.x/mask.png',
    inventory: { mode: 'made_to_order' },
    variants: [
      { sku: 'APRN-1007', size: 'L', color: 'Midnight Navy' },
      { sku: 'APRN-1007', size: 'XL', color: 'Midnight Navy', priceOverrideInr: 420 },
      { sku: 'APRN-1007', size: 'S', color: 'Pink', enabled: false },
    ],
  });
  await tick();
  mug = await CatalogProduct.create({ sku: 'MUG-11OZ', name: 'Ceramic Mug', category: 'Drinkware', basePriceInr: 199, inventory: { mode: 'physical', available: 5, reserved: 0 } });
  await tick();
  old = await CatalogProduct.create({ sku: 'OLD-1', name: 'Retired Cap', basePriceInr: 99, status: 'discontinued' });
  await CatalogProduct.create({ sku: 'DRAFT-1', name: 'Draft', basePriceInr: 1, status: 'draft' });
});

describe('GET /catalog/products', () => {
  it('returns active products with ids, variants, prices, images, specs — never cost or production files', async () => {
    const res = await get('/catalog/products');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => p.sku)).toEqual(['APRN-1007', 'MUG-11OZ']);
    const p = res.body.data[0];
    expect(p).toMatchObject({
      object: 'catalog_product',
      id: String(tee._id),
      status: 'active',
      brand: 'ShelfWear',
      category: { path: ['Apparel', 'T-Shirts'] },
      price: { amount: 392, currency: 'INR', tax_inclusive: true },
      availability: { status: 'made_to_order' },
      specifications: { material: 'Organic Cotton' },
      images: [{ url: 'https://cdn.x/tee.png', primary: true }, { url: 'https://cdn.x/tee-back.png', primary: false }],
    });
    expect(p.variants).toHaveLength(3);
    expect(p.variants[1]).toMatchObject({ id: String(tee.variants[1]._id), size: 'XL', price: { amount: 420 }, available: true, sku_unique: false });
    expect(p.variants[2].available).toBe(false);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/Secret Mills|costPrice|cost_price|mask\.png/);
    expect(res.body.data[1].availability).toEqual({ status: 'in_stock', quantity: 5 });
  });

  it('pages with a cursor and supports incremental sync including discontinued products', async () => {
    const p1 = await get('/catalog/products?limit=1');
    expect(p1.body).toMatchObject({ has_more: true });
    const p2 = await get(`/catalog/products?limit=1&cursor=${p1.body.next_cursor}`);
    expect(p2.body.data[0].sku).toBe('MUG-11OZ');
    expect(p2.body.has_more).toBe(false);

    const since = new Date(Date.now() - 60_000).toISOString();
    const sync = await get(`/catalog/products?updated_since=${since}`);
    expect(sync.body.data.map((p) => [p.sku, p.status])).toEqual([
      ['APRN-1007', 'active'],
      ['MUG-11OZ', 'active'],
      ['OLD-1', 'discontinued'],
    ]);
    expect(sync.body.sync_checkpoint).toBeTruthy();

    // Nothing changed after the checkpoint → empty page.
    const later = await get(`/catalog/products?updated_since=${new Date(Date.now() + 1000).toISOString()}`);
    expect(later.body.data).toEqual([]);

    expect((await get('/catalog/products?cursor=garbage')).status).toBe(400);
    expect((await get(`/catalog/products?ids=${mug._id}`)).body.data.map((p) => p.sku)).toEqual(['MUG-11OZ']);
    expect((await get('/catalog/products?category=Drinkware')).body.data.map((p) => p.sku)).toEqual(['MUG-11OZ']);
  });

  it('gets one product by id or SKU; drafts are invisible; categories list', async () => {
    expect((await get(`/catalog/products/${tee._id}`)).body.sku).toBe('APRN-1007');
    expect((await get('/catalog/products/MUG-11OZ')).body.id).toBe(String(mug._id));
    expect((await get('/catalog/products/DRAFT-1')).status).toBe(404);
    await Category.create({ name: 'Apparel', slug: 'apparel' });
    const cats = await get('/catalog/categories');
    expect(cats.body.data[0]).toMatchObject({ object: 'category', name: 'Apparel', parent_id: null });
  });

  it('needs the catalog:read scope', async () => {
    const t = (await createApiKey({ tenantId: tenant._id, name: 'o', mode: 'live', scopes: ['orders:write'] })).token;
    const res = await get('/catalog/products', t);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('insufficient_scope');
  });
});

describe('orders with ShelfMerch ids', () => {
  const order = (items, id) => post('/orders', { external_id: id, shipping_address: ADDRESS, items }, { idem: id });

  it('orders by variant_id, or product_id + size/color; returns product_id', async () => {
    const res = await order([{ variant_id: String(tee.variants[1]._id), quantity: 2 }, { product_id: String(tee._id), size: 'L', color: 'midnight navy', quantity: 1 }], 'ID-1');
    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({ product_id: String(tee._id), size: 'XL', color: 'Midnight Navy', quantity: 2, unit_price: 420 });
    expect(res.body.items[1]).toMatchObject({ size: 'L', unit_price: 392 });
  });

  it('rejects ambiguous lines, unknown ids and disabled variants with the right param', async () => {
    const both = await order([{ sku: 'APRN-1007', variant_id: String(tee.variants[0]._id), quantity: 1 }], 'ID-2');
    expect(both.status).toBe(400);

    const unknown = await order([{ variant_id: '507f1f77bcf86cd799439011', quantity: 1 }], 'ID-3');
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.details[0]).toMatchObject({ param: 'items[0].variant_id', code: 'unknown_sku' });

    const disabled = await order([{ variant_id: String(tee.variants[2]._id), quantity: 1 }], 'ID-4');
    expect(disabled.body.error.details[0]).toMatchObject({ code: 'variant_unavailable' });

    const discontinued = await order([{ product_id: String(old._id), quantity: 1 }], 'ID-5');
    expect(discontinued.body.error.details[0]).toMatchObject({ param: 'items[0].product_id', code: 'unknown_sku' });
  });

  it('a SKU shared by every variant is narrowed by size/colour, never defaulted to the first variant', async () => {
    const shared = await CatalogProduct.create({
      sku: 'APRN-2000',
      name: 'Crew Neck (shared SKU)',
      basePriceInr: 392,
      variants: [
        { sku: 'APRN-2000', size: 'S', color: 'Heather red' },
        { sku: 'APRN-2000', size: 'L', color: 'Heather red' },
        { sku: 'APRN-2000', size: 'S', color: 'White' },
        { sku: 'APRN-2000', size: 'L', color: 'White' },
      ],
    });
    const ok = await order([{ sku: 'APRN-2000', size: 'L', color: 'white', quantity: 1 }], 'SH-1');
    expect(ok.status).toBe(201);
    expect(ok.body.items[0]).toMatchObject({ size: 'L', color: 'White' });
    const stored = await (await import('../src/modules/orders/order.model.js')).Order.findOne({ tenantId: tenant._id, 'apiRef.externalId': 'SH-1' }).lean();
    expect(stored.items[0].variant).toEqual({ size: 'L', color: 'White' });

    // Not enough to choose → rejected with what to send (previously: silently S / Heather red).
    const noColor = await order([{ sku: 'APRN-2000', size: 'L', quantity: 1 }], 'SH-2');
    expect(noColor.status).toBe(422);
    expect(noColor.body.error.details[0]).toMatchObject({ code: 'variant_unavailable', message: expect.stringContaining('send color') });
    const nothing = await order([{ sku: 'APRN-2000', quantity: 1 }], 'SH-3');
    expect(nothing.body.error.details[0].message).toContain('send size and color');

    // A mapping that pins only the colour takes the size from the line.
    await request(app).put(api('/sku-mappings/MY-WHITE-TEE')).set('Authorization', `Bearer ${token}`).send({ catalog_sku: 'APRN-2000', color: 'White' });
    const mapped = await order([{ sku: 'MY-WHITE-TEE', size: 'S', quantity: 1 }], 'SH-4');
    expect(mapped.body.items[0]).toMatchObject({ size: 'S', color: 'White', product_id: String(shared._id) });
  });

  it('the product SKU sitting on ONE variant never pins that variant (cap: White ordered → White made)', async () => {
    // Real shape: 14-colour cap, only Navy Blue carries the product SKU, no sizes at all.
    await CatalogProduct.create({
      sku: 'ACCA-1022',
      name: 'Customized Cap',
      basePriceInr: 224,
      variants: [
        { sku: 'ACCA-1022', size: '', color: 'Navy Blue' },
        { sku: '', size: '', color: 'White' },
        { sku: '', size: '', color: 'Black' },
        { sku: 'CAP-RED', size: '', color: 'Red' },
      ],
    });
    // Storefront sends "One Size" for caps; the cap has no sizes, so it is ignored.
    const white = await order([{ sku: 'ACCA-1022', size: 'One Size', color: 'White', quantity: 1 }], 'CAP-1');
    expect(white.status).toBe(201);
    expect(white.body.items[0]).toMatchObject({ color: 'White', size: 'One Size' });
    const two = await order([{ sku: 'ACCA-1022', size: 'One Size', color: 'Navy Blue', quantity: 1 }, { sku: 'ACCA-1022', size: 'One Size', color: 'Black', quantity: 2 }], 'CAP-2');
    expect(two.body.items.map((i) => i.color)).toEqual(['Navy Blue', 'Black']);

    // No colour → rejected, never defaulted to Navy Blue.
    const noColor = await order([{ sku: 'ACCA-1022', quantity: 1 }], 'CAP-3');
    expect(noColor.status).toBe(422);
    expect(noColor.body.error.details[0].message).toContain('send color');

    // A colour the cap doesn't come in → rejected.
    const pink = await order([{ sku: 'ACCA-1022', color: 'Pink', quantity: 1 }], 'CAP-4');
    expect(pink.body.error.details[0]).toMatchObject({ code: 'variant_unavailable', message: expect.stringContaining('not available in Pink') });

    // A true variant SKU still pins its variant; a contradicting colour is rejected, not ignored.
    const red = await order([{ sku: 'CAP-RED', quantity: 1 }], 'CAP-5');
    expect(red.body.items[0].color).toBe('Red');
    const clash = await order([{ sku: 'CAP-RED', color: 'White', quantity: 1 }], 'CAP-6');
    expect(clash.status).toBe(422);
    expect(clash.body.error.details[0].message).toContain('is the Red variant');
  });

  it('existing SKU ordering is unchanged', async () => {
    const res = await order([{ sku: 'APRN-1007', size: 'L', color: 'Midnight Navy', quantity: 1 }], 'ID-6');
    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({ sku: 'APRN-1007', size: 'L' });
  });
});

describe('artwork placement (print_areas)', () => {
  const png = (w, h) => {
    const b = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write('IHDR', 12, 'ascii');
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(h, 20);
    return b;
  };
  const FILES = {
    'https://cdn.client.example/logo-2400x1800.png': () => new Response(png(2400, 1800), { status: 206 }),
    'https://cdn.client.example/tiny-400x300.png': () => new Response(png(400, 300), { status: 200 }),
    'https://cdn.client.example/micro-200x150.png': () => new Response(png(200, 150), { status: 200 }),
    'https://cdn.client.example/logo.svg': () => new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', { status: 200 }),
    'https://cdn.client.example/moved.png': () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/x.png' } }),
  };
  let cap;

  beforeEach(async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (FILES[String(url)] ?? (() => new Response('nope', { status: 404 })))());
    cap = await CatalogProduct.create({
      sku: 'CAP-PLACE',
      name: 'Placement Cap',
      basePriceInr: 224,
      physicalDimensions: { width: 20, height: 24 },
      printAreas: [{ key: 'front', label: 'Front', xIn: 5, yIn: 4, widthIn: 10, heightIn: 12, dpi: 300, methods: ['dtf'] }],
      variants: [{ sku: 'CAP-PLACE', size: '', color: 'White' }],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const place = (areas, id, extra = {}) =>
    post('/orders', { external_id: id, shipping_address: ADDRESS, items: [{ sku: 'CAP-PLACE', color: 'White', quantity: 1, print_areas: areas, ...extra }] }, { idem: id });

  it('the catalog lists print areas in inches', async () => {
    const p = (await get(`/catalog/products/${cap._id}`)).body;
    expect(p.print_areas).toEqual([{ key: 'front', label: 'Front', width_in: 10, height_in: 12, dpi: 300, methods: ['dtf'] }]);
  });

  it('stores exact size/position and echoes it back with the effective DPI', async () => {
    const res = await place([{ area: 'front', artwork_url: 'https://cdn.client.example/logo-2400x1800.png', width_in: 8, left_in: 1, top_in: 2 }], 'PL-1');
    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({
      artwork_url: 'https://cdn.client.example/logo-2400x1800.png',
      print_areas: [{ area: 'front', width_in: 8, height_in: 6, left_in: 1, top_in: 2, effective_dpi: 300 }],
    });
    const { Order } = await import('../src/modules/orders/order.model.js');
    const stored = (await Order.findOne({ tenantId: tenant._id, 'apiRef.externalId': 'PL-1' }).lean()).items[0];
    // Centre (1+4, 2+3) in a 10×12 in area → 50% / 41.67%; width 8/10 → 80%.
    expect(stored.placements[0]).toMatchObject({ key: 'front', printCxPct: 50, printWPct: 80, artworkWidthPx: 2400 });
    expect(stored.placements[0].printCyPct).toBeCloseTo(41.67, 1);
    expect(stored.placement).toMatchObject({ printCxPct: 50, printWPct: 80 });
  });

  it('centres the artwork when left/top are omitted', async () => {
    const res = await place([{ area: 'Front', artwork_url: 'https://cdn.client.example/logo-2400x1800.png', width_in: 8 }], 'PL-2');
    expect(res.body.items[0].print_areas[0]).toMatchObject({ left_in: 1, top_in: 3, height_in: 6 });
  });

  it('rejects wrong shape, out of bounds, low resolution, unknown area, SVG and redirects — with the reason', async () => {
    const cases = [
      [[{ area: 'front', artwork_url: 'https://cdn.client.example/logo-2400x1800.png', width_in: 8, height_in: 8 }], 'artwork_aspect_mismatch', 'items[0].print_areas[0].height_in'],
      [[{ area: 'front', artwork_url: 'https://cdn.client.example/logo-2400x1800.png', width_in: 8, left_in: 3 }], 'artwork_out_of_bounds', 'items[0].print_areas[0]'],
      [[{ area: 'front', artwork_url: 'https://cdn.client.example/micro-200x150.png', width_in: 8 }], 'artwork_low_resolution', 'items[0].print_areas[0].artwork_url'],
      [[{ area: 'back', artwork_url: 'https://cdn.client.example/logo-2400x1800.png', width_in: 4 }], 'print_area_not_found', 'items[0].print_areas[0].area'],
      [[{ area: 'front', artwork_url: 'https://cdn.client.example/logo.svg', width_in: 4 }], 'artwork_unsupported_format', 'items[0].print_areas[0].artwork_url'],
      [[{ area: 'front', artwork_url: 'https://cdn.client.example/moved.png', width_in: 4 }], 'artwork_redirect', 'items[0].print_areas[0].artwork_url'],
    ];
    for (const [areas, code, param] of cases) {
      const res = await place(areas, `PL-${code}`);
      expect(res.status, code).toBe(422);
      expect(res.body.error.details[0], code).toMatchObject({ code, param });
    }
    const unprintable = await place([{ area: 'front', artwork_url: 'https://cdn.client.example/micro-200x150.png', width_in: 8 }], 'PL-low-2');
    expect(unprintable.body.error.details[0].message).toContain('only 25 DPI at 8×6 in, too low to print');
  });

  it('accepts low-resolution artwork (≥30 DPI) but flags it', async () => {
    const res = await place([{ area: 'front', artwork_url: 'https://cdn.client.example/tiny-400x300.png', width_in: 8 }], 'PL-lowres');
    expect(res.status).toBe(201);
    expect(res.body.items[0].print_areas[0]).toMatchObject({ effective_dpi: 50, low_resolution: true });
    const ok = await place([{ area: 'front', artwork_url: 'https://cdn.client.example/logo-2400x1800.png', width_in: 8 }], 'PL-hires');
    expect(ok.body.items[0].print_areas[0]).toMatchObject({ effective_dpi: 300, low_resolution: false });
  });

  it('artwork_url and print_areas are not combined; plain artwork_url lines still work', async () => {
    const both = await place([{ area: 'front', artwork_url: 'https://cdn.client.example/logo-2400x1800.png', width_in: 8 }], 'PL-both', { artwork_url: 'https://cdn.client.example/logo-2400x1800.png' });
    expect(both.status).toBe(400);
    const plain = await post('/orders', { external_id: 'PL-plain', shipping_address: ADDRESS, items: [{ sku: 'CAP-PLACE', color: 'White', quantity: 1, artwork_url: 'https://cdn.client.example/anything.png' }] }, { idem: 'PL-plain' });
    expect(plain.status).toBe(201);
    expect(plain.body.items[0]).toMatchObject({ artwork_url: 'https://cdn.client.example/anything.png', print_areas: [] });
  });
});

describe('POST /catalog/imports', () => {
  it('imports all, then skips unchanged and reports changed products as updated — never duplicates', async () => {
    const first = await post('/catalog/imports', { all: true }, { idem: 'imp-1' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ object: 'catalog_import', status: 'completed', summary: { requested: 2, imported: 2, updated: 0, skipped: 0, failed: 0 } });

    // Same Idempotency-Key → same import, no second run.
    const replay = await post('/catalog/imports', { all: true }, { idem: 'imp-1' });
    expect(replay.body.id).toBe(first.body.id);

    await tick();
    await CatalogProduct.updateOne({ _id: mug._id }, { $set: { basePriceInr: 249 } });
    const second = await post('/catalog/imports', { all: true }, { idem: 'imp-2' });
    expect(second.body.summary).toMatchObject({ imported: 0, updated: 1, skipped: 1, failed: 0 });
    expect(await ImportedProduct.countDocuments({ tenantId: tenant._id })).toBe(2);

    const items = await get(`/catalog/imports/${second.body.id}/items`);
    expect(items.body.data.map((i) => [i.sku, i.result])).toEqual([['APRN-1007', 'skipped'], ['MUG-11OZ', 'updated']]);
  });

  it('imports selected products and reports failures per product', async () => {
    const res = await post('/catalog/imports', { product_ids: [String(tee._id), String(tee._id), String(old._id), '507f1f77bcf86cd799439011', 'nope'] }, { idem: 'imp-3' });
    expect(res.body.summary).toEqual({ requested: 4, imported: 1, updated: 0, skipped: 0, failed: 3 });
    const failed = await get(`/catalog/imports/${res.body.id}/items?result=failed`);
    expect(failed.body.data.map((i) => i.reason)).toEqual(['product_discontinued', 'product_not_found', 'product_not_found']);

    const imported = await get('/catalog/imported');
    expect(imported.body.data.map((i) => i.product_id)).toEqual([String(tee._id)]);
    expect((await get('/catalog/products?imported=true')).body.data.map((p) => p.sku)).toEqual(['APRN-1007']);

    const removed = await request(app).delete(api(`/catalog/imported/${tee._id}`)).set('Authorization', `Bearer ${token}`);
    expect(removed.body).toMatchObject({ removed: true });
    expect((await get('/catalog/imported')).body.data).toEqual([]);
  });

  it('shows imports to company admins in the app', async () => {
    await post('/catalog/imports', { all: true }, { idem: 'app-1' });
    const admin = await makeUser(tenant, 'company_admin');
    const res = await request(app).get('/api/v1/developers/catalog-imports').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.importedCount).toBe(2);
    expect(res.body.imports[0].summary).toMatchObject({ imported: 2 });
  });

  it('validates the request and needs catalog:import', async () => {
    expect((await post('/catalog/imports', {}, { idem: 'v1' })).status).toBe(400);
    expect((await post('/catalog/imports', { all: true, product_ids: ['x'] }, { idem: 'v2' })).status).toBe(400);
    const ro = (await createApiKey({ tenantId: tenant._id, name: 'r', mode: 'live', scopes: ['catalog:read'] })).token;
    expect((await post('/catalog/imports', { all: true }, { t: ro, idem: 'v3' })).status).toBe(403);
  });
});

describe('catalog change webhooks', () => {
  async function endpoint(tenantId, events, mode = 'live') {
    return WebhookEndpoint.create({ tenantId, url: 'https://hooks.example/x', mode, events, encryptedSecret: encryptToken('whsec_x') });
  }
  const eventsFor = async (tenantId) => (await WebhookEvent.find({ tenantId }).sort({ createdAt: 1 }).lean()).map((e) => e.type);

  it('sends price, availability and discontinued events only to tenants that imported the product, opt-in only', async () => {
    const subscribed = await endpoint(tenant._id, ['catalog.product.price_changed', 'catalog.product.availability_changed', 'catalog.product.discontinued', 'order.shipped']);
    await endpoint(tenant._id, []); // "all events" endpoint: must not get catalog events
    const other = await makeTenant(); // did not import
    await endpoint(other._id, ['catalog.product.price_changed']);

    await post('/catalog/imports', { product_ids: [String(mug._id)] }, { idem: 'w-1' });
    expect((await sweepCatalogChanges()).events).toBe(0); // first sweep only records a baseline

    await tick();
    const m = await CatalogProduct.findById(mug._id);
    m.basePriceInr = 249;
    await m.save();
    await tick();
    m.inventory.available = 0;
    await m.save();
    await sweepCatalogChanges();

    expect(await eventsFor(tenant._id)).toEqual(['catalog.product.price_changed', 'catalog.product.availability_changed']);
    expect(await eventsFor(other._id)).toEqual([]);
    const deliveries = await WebhookDelivery.find({ tenantId: tenant._id }).lean();
    expect(deliveries.every((d) => String(d.endpointId) === String(subscribed._id))).toBe(true);
    const ev = await WebhookEvent.findOne({ tenantId: tenant._id, type: 'catalog.product.price_changed' }).lean();
    expect(ev.payload.data).toMatchObject({ object: { id: String(mug._id), price: { amount: 249 } }, previous_attributes: { prices: { product: 199 } } });

    await tick();
    await CatalogProduct.updateOne({ _id: mug._id }, { $set: { status: 'discontinued' } });
    await sweepCatalogChanges();
    expect((await eventsFor(tenant._id)).at(-1)).toBe('catalog.product.discontinued');

    // Nothing changed → nothing sent.
    const before = (await eventsFor(tenant._id)).length;
    await sweepCatalogChanges();
    expect((await eventsFor(tenant._id)).length).toBe(before);
  });
});
