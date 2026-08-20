import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import {
  mapShopifyContent,
  parseShopifyStorefrontTabs,
  resolveHsnFromInventoryItems,
  normalizeDomain,
} from '../src/modules/catalog/shopifyImport.service.js';

let app;
let catalogToken;
let tenantToken;

async function makeUser(tenantDoc, role, scopeType) {
  const user = await User.create({
    tenantId: tenantDoc?._id ?? null,
    name: `${role} user`,
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenantDoc?._id ?? null,
    userId: user._id,
    role,
    scopeType,
  });
  return signAccessToken(user, assignment);
}

const SHOPIFY_PAYLOAD = {
  products: [
    {
      id: 111,
      title: 'Classic Tee',
      handle: 'classic-tee',
      vendor: 'Acme',
      product_type: 'Apparel',
      body_html: '<p>Soft <b>cotton</b> tee</p>',
      options: [{ name: 'Color' }, { name: 'Size' }],
      image: { src: 'https://cdn.shopify.com/tee.jpg' },
      images: [{ src: 'https://cdn.shopify.com/tee.jpg' }],
      variants: [
        {
          sku: 'TEE-BLK-M',
          price: '499.00',
          inventory_quantity: 10,
          inventory_item_id: 9001,
          option1: 'Black',
          option2: 'M',
        },
        {
          sku: 'TEE-BLK-L',
          price: '549.00',
          inventory_quantity: 5,
          inventory_item_id: 9002,
          option1: 'Black',
          option2: 'L',
        },
      ],
    },
    {
      id: 222,
      title: 'Steel Bottle',
      handle: 'steel-bottle',
      vendor: 'Acme',
      product_type: 'Drinkware',
      body_html: 'Insulated bottle',
      options: [{ name: 'Title' }],
      images: [],
      variants: [
        {
          sku: 'BTL-750',
          price: '689',
          inventory_quantity: 20,
          inventory_item_id: 9003,
          option1: 'Default',
        },
      ],
    },
  ],
};

const INVENTORY_ITEMS = {
  9001: {
    id: 9001,
    sku: 'TEE-BLK-M',
    harmonized_system_code: '610520',
    country_harmonized_system_codes: [],
  },
  9002: {
    id: 9002,
    sku: 'TEE-BLK-L',
    harmonized_system_code: '610520',
    country_harmonized_system_codes: [],
  },
  9003: {
    id: 9003,
    sku: 'BTL-750',
    harmonized_system_code: null,
    country_harmonized_system_codes: [
      { country_code: 'IN', harmonized_system_code: '73239390' },
    ],
  },
};

/** Route Shopify list / metafield / inventory / GraphQL stubs by URL. */
function stubShopifyFetch(productsPayload = SHOPIFY_PAYLOAD) {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/inventory_items.json')) {
      const ids = new URL(u).searchParams.get('ids')?.split(',') ?? [];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          inventory_items: ids.map((id) => INVENTORY_ITEMS[id]).filter(Boolean),
        }),
        headers: { get: () => null },
      };
    }
    if (u.includes('/metafields')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ metafields: [] }),
        headers: { get: () => null },
      };
    }
    if (u.includes('/graphql.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { product: null } }),
        headers: { get: () => null },
      };
    }
    if (u.includes('/products.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => productsPayload,
        headers: { get: () => null },
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      headers: { get: () => null },
    };
  });
}

function stubFetch(status, payload, linkHeader = null) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    headers: { get: (h) => (h.toLowerCase() === 'link' ? linkHeader : null) },
  });
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
afterEach(() => vi.restoreAllMocks());

beforeEach(async () => {
  await clearTestDb();
  catalogToken = await makeUser(null, 'platform_catalog_admin', 'platform');
  const tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix' });
  tenantToken = await makeUser(tenant, 'company_admin', 'tenant');
});

const importReq = (token) =>
  request(app)
    .post('/api/v1/platform/products/import/shopify')
    .set('Authorization', `Bearer ${token}`)
    .send({ domain: 'xyz.myshopify.com', accessToken: 'shpat_test' });

describe('Shopify catalog import', () => {
  it('accepts a shop handle or full myshopify host', () => {
    expect(normalizeDomain('xzhbhm-qa')).toBe('xzhbhm-qa.myshopify.com');
    expect(normalizeDomain('https://xzhbhm-qa.myshopify.com/admin')).toBe('xzhbhm-qa.myshopify.com');
  });

  it('separates metafield description/features from the body_html size guide', () => {
    const content = mapShopifyContent(
      '<table><tr><td>Feature</td><td>Details</td></tr><tr><td>Material</td><td>Cork</td></tr></table>',
      [
        {
          namespace: 'custom',
          key: 'product_description',
          type: 'multi_line_text_field',
          value: 'A natural cork trophy for recognition awards.',
        },
        { namespace: 'custom', key: 'features', type: 'single_line_text_field', value: 'Angular design' },
        { namespace: 'custom', key: 'material', type: 'single_line_text_field', value: 'Cork' },
        {
          namespace: 'custom',
          key: 'file_guidelines',
          type: 'multi_line_text_field',
          value: 'Do not import this text',
        },
      ],
    );

    expect(content.description).toBe('A natural cork trophy for recognition awards.');
    expect(content.keyFeatures).toContain('Features: Angular design');
    expect(content.keyFeatures).toContain('Material: Cork');
    expect(content.sizeGuide).toContain('Feature: Details');
    expect(JSON.stringify(content)).not.toContain('Do not import this text');
  });

  it('parses the rendered Shopify Description, Key features, and Size Guide tabs', () => {
    const tabs = parseShopifyStorefrontTabs(`
      <div data-tab-title="Description">
        <style>.noise { color: red; }</style>
        <span class="metafield-multi_line_text_field">Actual product description<br>Second line</span>
        <div>Read more</div>
      </div>
      <div data-tab-title="Key features">
        <ul>
          <li><p>Features</p><p>x x x</p></li>
          <li><p>Material</p><p>Cork</p></li>
          <li><p>Brand</p><p>9Cork</p></li>
        </ul>
      </div>
      <div data-tab-title="Size Guide">
        <table><tr><td>Feature</td><td>Details</td></tr></table>
      </div>
      <div data-tab-title="File Guidelines">Do not import this</div>
    `);

    expect(tabs.description).toBe('Actual product description\nSecond line');
    expect(tabs.keyFeatures).toBe('Material: Cork\nBrand: 9Cork');
    expect(tabs.sizeGuide).toBe('Feature: Details');
    expect(JSON.stringify(tabs)).not.toContain('Do not import this');
  });

  it('prefers India country HSN over the general HS code', () => {
    expect(
      resolveHsnFromInventoryItems([
        {
          harmonized_system_code: '610520',
          country_harmonized_system_codes: [
            { country_code: 'IN', harmonized_system_code: '61052010' },
          ],
        },
      ]),
    ).toBe('61052010');
    expect(resolveHsnFromInventoryItems([{ harmonized_system_code: '610520' }])).toBe('610520');
    expect(resolveHsnFromInventoryItems([])).toBe('');
  });

  it('imports products as drafts with mapped fields and source id', async () => {
    const fetchMock = stubShopifyFetch();
    vi.stubGlobal('fetch', fetchMock);
    const res = await importReq(catalogToken);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.updated).toBe(0);
    expect(res.body.skipped).toBe(0);

    // First products page must request only Shopify-active catalog items.
    const productListCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/products.json'));
    expect(productListCall).toBeTruthy();
    expect(String(productListCall[0])).toContain('status=active');

    // HSN is read from InventoryItem, not products.json.
    const inventoryCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/inventory_items.json'));
    expect(inventoryCall).toBeTruthy();

    const tee = await CatalogProduct.findOne({ 'source.externalId': '111' });
    expect(tee.status).toBe('draft');
    expect(tee.brand).toBe('Acme');
    expect(tee.category).toBe('');
    expect(tee.subcategory).toBe('');
    expect(tee.basePriceInr).toBe(499); // min variant price
    expect(tee.hsnCode).toBe('610520');
    expect(tee.variants).toHaveLength(2);
    expect(tee.variants[0]).toMatchObject({ color: 'Black', size: 'M', sku: 'TEE-BLK-M' });
    expect(tee.primaryImageUrl).toBe('https://cdn.shopify.com/tee.jpg');
    expect(tee.imageUrls).toEqual(['https://cdn.shopify.com/tee.jpg']);
    expect(tee.maskImageUrl).toBe('');
    expect(tee.source.provider).toBe('shopify');
    expect(tee.source.categoryAssignedByAdmin).toBe(false);
    // Imported products are made-to-order so they don't read as "out of stock".
    expect(tee.inventory.mode).toBe('made_to_order');

    const bottle = await CatalogProduct.findOne({ 'source.externalId': '222' });
    expect(bottle.hsnCode).toBe('73239390');
  });

  it('ignores draft and archived Shopify products even if returned', async () => {
    const mixed = {
      products: [
        { ...SHOPIFY_PAYLOAD.products[0], status: 'active' },
        { ...SHOPIFY_PAYLOAD.products[1], id: 333, title: 'Draft Mug', status: 'draft' },
        {
          id: 444,
          title: 'Archived Cap',
          handle: 'archived-cap',
          vendor: 'Acme',
          product_type: 'Apparel',
          body_html: 'Old',
          options: [],
          images: [],
          variants: [{ sku: 'CAP-1', price: '199', inventory_quantity: 0 }],
          status: 'archived',
        },
      ],
    };
    vi.stubGlobal('fetch', stubShopifyFetch(mixed));
    const res = await importReq(catalogToken);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(await CatalogProduct.countDocuments({ 'source.provider': 'shopify' })).toBe(1);
    const only = await CatalogProduct.findOne({ 'source.provider': 'shopify' });
    expect(only.source.externalId).toBe('111');
    expect(only.status).toBe('draft');
  });

  it('skips products already imported on re-import (idempotent)', async () => {
    vi.stubGlobal('fetch', stubShopifyFetch());
    await importReq(catalogToken);
    const importedTee = await CatalogProduct.findOne({ 'source.externalId': '111' });
    const updateRes = await request(app)
      .patch(`/api/v1/platform/products/${importedTee._id}`)
      .set('Authorization', `Bearer ${catalogToken}`)
      .send({
        name: importedTee.name,
        category: 'Apparel',
        subcategory: 'T-Shirts',
        sellingPriceInr: importedTee.basePriceInr,
        costPriceInr: 0,
        brand: importedTee.brand,
        description: importedTee.description,
        keyFeatures: importedTee.keyFeatures,
        sizeGuide: importedTee.sizeGuide,
        gstRate: importedTee.gstRate,
        hsnCode: importedTee.hsnCode,
        moq: importedTee.moq,
        material: importedTee.material,
        productionDays: importedTee.productionDays,
        reason: 'admin selected category',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.source.categoryAssignedByAdmin).toBe(true);
    vi.stubGlobal('fetch', stubShopifyFetch());
    const res = await importReq(catalogToken);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
    expect(res.body.skipped).toBe(2);
    expect(await CatalogProduct.countDocuments({ 'source.provider': 'shopify' })).toBe(2);
    const tee = await CatalogProduct.findOne({ 'source.externalId': '111' });
    expect(tee.category).toBe('Apparel');
    expect(tee.subcategory).toBe('T-Shirts');
  });

  it('returns a friendly error for an invalid token (401 from Shopify)', async () => {
    vi.stubGlobal('fetch', stubFetch(401, {}));
    const res = await importReq(catalogToken);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SHOPIFY_UNAUTHORIZED');
  });

  it('rejects a client secret pasted as the access token', async () => {
    const res = await request(app)
      .post('/api/v1/platform/products/import/shopify')
      .set('Authorization', `Bearer ${catalogToken}`)
      .send({ domain: 'xyz.myshopify.com', accessToken: 'shpss_not_a_token' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TOKEN_REQUIRED');
  });

  it('imports via GraphQL when REST products.json is unavailable', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const u = String(url);
      if (u.includes('/products.json')) {
        return { ok: false, status: 404, json: async () => ({ errors: 'Not Found' }), headers: { get: () => null } };
      }
      if (u.includes('/inventory_items.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ inventory_items: Object.values(INVENTORY_ITEMS) }),
          headers: { get: () => null },
        };
      }
      if (u.includes('/metafields')) {
        return { ok: true, status: 200, json: async () => ({ metafields: [] }), headers: { get: () => null } };
      }
      if (u.includes('/graphql.json')) {
        const payload = JSON.parse(init?.body || '{}');
        if (String(payload.query || '').includes('ImportProducts')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                products: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      id: 'gid://shopify/Product/111',
                      title: 'Classic Tee',
                      handle: 'classic-tee',
                      vendor: 'Acme',
                      productType: 'Apparel',
                      status: 'ACTIVE',
                      tags: [],
                      descriptionHtml: '<p>Soft cotton tee</p>',
                      options: [{ name: 'Color' }, { name: 'Size' }],
                      featuredImage: { url: 'https://cdn.shopify.com/tee.jpg' },
                      images: { nodes: [{ url: 'https://cdn.shopify.com/tee.jpg' }] },
                      variants: {
                        nodes: [
                          {
                            sku: 'TEE-BLK-M',
                            price: '499.00',
                            inventoryQuantity: 10,
                            selectedOptions: [{ name: 'Color', value: 'Black' }, { name: 'Size', value: 'M' }],
                            inventoryItem: { id: 'gid://shopify/InventoryItem/9001' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            }),
            headers: { get: () => null },
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { product: null } }),
          headers: { get: () => null },
        };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => '', headers: { get: () => null } };
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await importReq(catalogToken);
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    const tee = await CatalogProduct.findOne({ 'source.externalId': '111' });
    expect(tee.name).toBe('Classic Tee');
    expect(tee.variants[0]).toMatchObject({ color: 'Black', size: 'M', sku: 'TEE-BLK-M' });
  });

  it('forbids a tenant role from importing (403)', async () => {
    vi.stubGlobal('fetch', stubShopifyFetch());
    const res = await importReq(tenantToken);
    expect(res.status).toBe(403);
  });

  it('does not rewrite filled category, GST, masks, or print areas on re-import', async () => {
    vi.stubGlobal('fetch', stubShopifyFetch());
    await importReq(catalogToken);

    const tee = await CatalogProduct.findOne({ 'source.externalId': '111' });
    tee.category = 'Apparel';
    tee.subcategory = 'T-Shirts';
    tee.gstRate = 12;
    tee.maskImageUrl = 'https://cdn.shopify.com/tee.jpg';
    tee.maskBackImageUrl = '/uploads/platform/product/mask-back.png';
    tee.printAreas = [{ key: 'front', label: 'Front', widthIn: 10, heightIn: 12 }];
    tee.description = 'admin edited copy';
    await tee.save();

    vi.stubGlobal('fetch', stubShopifyFetch());
    const res = await importReq(catalogToken);
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);

    const reloaded = await CatalogProduct.findOne({ 'source.externalId': '111' });
    expect(reloaded.category).toBe('Apparel');
    expect(reloaded.subcategory).toBe('T-Shirts');
    expect(reloaded.gstRate).toBe(12);
    expect(reloaded.maskImageUrl).toBe('https://cdn.shopify.com/tee.jpg');
    expect(reloaded.maskBackImageUrl).toBe('/uploads/platform/product/mask-back.png');
    expect(reloaded.printAreas).toHaveLength(1);
    expect(reloaded.printAreas[0]).toMatchObject({ key: 'front', label: 'Front', widthIn: 10, heightIn: 12 });
  });

  it('backfills empty hsnCode on re-import without overwriting a set value', async () => {
    vi.stubGlobal('fetch', stubShopifyFetch());
    await importReq(catalogToken);

    const tee = await CatalogProduct.findOne({ 'source.externalId': '111' });
    tee.hsnCode = '';
    await tee.save();
    const bottle = await CatalogProduct.findOne({ 'source.externalId': '222' });
    bottle.hsnCode = '999999';
    await bottle.save();

    vi.stubGlobal('fetch', stubShopifyFetch());
    const res = await importReq(catalogToken);
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.skipped).toBe(1);

    expect((await CatalogProduct.findOne({ 'source.externalId': '111' })).hsnCode).toBe('610520');
    expect((await CatalogProduct.findOne({ 'source.externalId': '222' })).hsnCode).toBe('999999');
  });
});
