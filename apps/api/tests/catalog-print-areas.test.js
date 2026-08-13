import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';

let app;
let catalogToken;
let supportToken;
let product;

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

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  catalogToken = await makeUser(null, 'platform_catalog_admin', 'platform');
  const tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix' });
  supportToken = await makeUser(tenant, 'company_admin', 'tenant');
  product = await CatalogProduct.create({
    sku: `SM-TEE-${Date.now()}`,
    name: 'Core Cotton Tee',
    category: 'Apparel',
    basePriceInr: 499,
  });
});

const area = (over = {}) => ({
  key: 'front',
  label: 'Front',
  mockupImageUrl: '/uploads/platform/product/abc.png',
  xIn: 5,
  yIn: 6,
  widthIn: 10,
  heightIn: 9.6,
  box: { xPct: 25, yPct: 30, widthPct: 50, heightPct: 40 },
  maxWidthCm: 28,
  maxHeightCm: 35,
  dpi: 300,
  methods: ['dtf', 'screen_print'],
  ...over,
});

describe('platform product print areas (POD placeholders)', () => {
  it('saves print-area geometry and derives printableAreas from labels', async () => {
    const res = await request(app)
      .put(`/api/v1/platform/products/${product._id}/print-areas`)
      .set('Authorization', `Bearer ${catalogToken}`)
      .send({ printAreas: [area(), area({ key: 'back', label: 'Back' })] });
    expect(res.status).toBe(200);
    expect(res.body.printAreas).toHaveLength(2);
    expect(res.body.printAreas[0].widthIn).toBe(10);
    expect(res.body.printAreas[0].box.widthPct).toBeGreaterThan(0);

    const reloaded = await CatalogProduct.findById(product._id);
    expect(reloaded.printAreas).toHaveLength(2);
    expect(reloaded.printAreas[0].widthIn).toBe(10);
    expect(reloaded.printableAreas).toEqual(['Front', 'Back']);
  });

  it('persists physicalDimensions + dpi with print areas', async () => {
    const res = await request(app)
      .put(`/api/v1/platform/products/${product._id}/print-areas`)
      .set('Authorization', `Bearer ${catalogToken}`)
      .send({
        physicalDimensions: { width: 18, height: 22, length: 16 },
        dpi: 300,
        printAreas: [area({ widthIn: 3.1, heightIn: 3.1, xIn: 7, yIn: 8 })],
      });
    expect(res.status).toBe(200);
    expect(res.body.physicalDimensions.width).toBe(18);
    expect(res.body.printAreas[0].widthIn).toBe(3.1);
    expect(res.body.dpi).toBe(300);
  });

  it('rejects print areas without inches, box, or cm size (400)', async () => {
    const res = await request(app)
      .put(`/api/v1/platform/products/${product._id}/print-areas`)
      .set('Authorization', `Bearer ${catalogToken}`)
      .send({
        printAreas: [
          {
            key: 'front',
            label: 'Front',
            box: { xPct: 10, yPct: 10, widthPct: 0, heightPct: 0 },
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts legacy widthIn: 0 when box % is valid (treats 0 as unset)', async () => {
    const res = await request(app)
      .put(`/api/v1/platform/products/${product._id}/print-areas`)
      .set('Authorization', `Bearer ${catalogToken}`)
      .send({
        printAreas: [
          {
            key: 'front',
            label: 'Front',
            widthIn: 0,
            heightIn: 0,
            box: { xPct: 25, yPct: 30, widthPct: 50, heightPct: 40 },
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.printAreas[0].widthIn).toBeGreaterThan(0);
  });

  it('forbids a tenant role from writing print areas (403)', async () => {
    const res = await request(app)
      .put(`/api/v1/platform/products/${product._id}/print-areas`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ printAreas: [area()] });
    expect(res.status).toBe(403);
  });
});

describe('product variant colorHex + master image roles', () => {
  it('persists colorHex when adding a variant', async () => {
    const res = await request(app)
      .post(`/api/v1/platform/products/${product._id}/variants`)
      .set('Authorization', `Bearer ${catalogToken}`)
      .send({ sku: 'TEE-NVY-M', color: 'Navy', colorHex: '#1e3a8a', size: 'M' });
    expect(res.status).toBe(201);
    const reloaded = await CatalogProduct.findById(product._id);
    expect(reloaded.variants[0]).toMatchObject({ color: 'Navy', colorHex: '#1e3a8a', enabled: true });
  });

  it('can disable a variant and hides it from tenant catalog', async () => {
    const add = await request(app)
      .post(`/api/v1/platform/products/${product._id}/variants`)
      .set('Authorization', `Bearer ${catalogToken}`)
      .send({ sku: 'TEE-BLK-M', color: 'Black', colorHex: '#111111', size: 'M' });
    expect(add.status).toBe(201);
    const variantId = add.body[0]._id;

    const patch = await request(app)
      .patch(`/api/v1/platform/products/${product._id}/variants/${variantId}`)
      .set('Authorization', `Bearer ${catalogToken}`)
      .send({ enabled: false });
    expect(patch.status).toBe(200);
    expect(patch.body[0]).toMatchObject({ sku: 'TEE-BLK-M', color: 'Black', enabled: false });

    product.status = 'active';
    await product.save();

    const tenant = await request(app)
      .get(`/api/v1/catalog/products/${product._id}`)
      .set('Authorization', `Bearer ${supportToken}`);
    expect(tenant.status).toBe(200);
    expect(tenant.body.variants).toEqual([]);

    const platform = await request(app)
      .get(`/api/v1/platform/products/${product._id}`)
      .set('Authorization', `Bearer ${catalogToken}`);
    expect(platform.status).toBe(200);
    expect(platform.body.variants).toHaveLength(1);
    expect(platform.body.variants[0].enabled).toBe(false);
  });

  it('setRoleImage stores base and mask master images separately', async () => {
    const { setRoleImage } = await import('../src/modules/catalog/platformCatalog.service.js');
    await setRoleImage(product._id, 'base', '/uploads/platform/product/base.png');
    await setRoleImage(product._id, 'mask', '/uploads/platform/product/mask.png');
    const reloaded = await CatalogProduct.findById(product._id);
    expect(reloaded.baseImageUrl).toBe('/uploads/platform/product/base.png');
    expect(reloaded.maskImageUrl).toBe('/uploads/platform/product/mask.png');
  });

  it('setRoleImage stores back-view base and mask images', async () => {
    const { setRoleImage } = await import('../src/modules/catalog/platformCatalog.service.js');
    await setRoleImage(product._id, 'base_back', '/uploads/platform/product/base-back.png');
    await setRoleImage(product._id, 'mask_back', '/uploads/platform/product/mask-back.png');
    const reloaded = await CatalogProduct.findById(product._id);
    expect(reloaded.baseBackImageUrl).toBe('/uploads/platform/product/base-back.png');
    expect(reloaded.maskBackImageUrl).toBe('/uploads/platform/product/mask-back.png');
  });

  it('setRoleImage stores left and right side base and mask images', async () => {
    const { setRoleImage } = await import('../src/modules/catalog/platformCatalog.service.js');
    await setRoleImage(product._id, 'base_left', '/uploads/platform/product/base-left.png');
    await setRoleImage(product._id, 'mask_left', '/uploads/platform/product/mask-left.png');
    await setRoleImage(product._id, 'base_right', '/uploads/platform/product/base-right.png');
    await setRoleImage(product._id, 'mask_right', '/uploads/platform/product/mask-right.png');
    const reloaded = await CatalogProduct.findById(product._id);
    expect(reloaded.baseLeftImageUrl).toBe('/uploads/platform/product/base-left.png');
    expect(reloaded.maskLeftImageUrl).toBe('/uploads/platform/product/mask-left.png');
    expect(reloaded.baseRightImageUrl).toBe('/uploads/platform/product/base-right.png');
    expect(reloaded.maskRightImageUrl).toBe('/uploads/platform/product/mask-right.png');
  });

  it('keeps a legacy Shopify photo as marketing when a production mask is uploaded', async () => {
    product.source = {
      provider: 'shopify',
      domain: 'example.myshopify.com',
      externalId: '123',
    };
    product.primaryImageUrl = '/uploads/platform/product/shopify.png';
    product.imageUrls = ['/uploads/platform/product/shopify.png'];
    await product.save();

    const { setRoleImage } = await import('../src/modules/catalog/platformCatalog.service.js');
    await setRoleImage(product._id, 'mask', '/uploads/platform/product/mask.png');
    const reloaded = await CatalogProduct.findById(product._id);
    expect(reloaded.maskImageUrl).toBe('/uploads/platform/product/mask.png');
    expect(reloaded.primaryImageUrl).toBe('/uploads/platform/product/shopify.png');
  });
});

describe('public catalog browse', () => {
  it('lists and fetches products without a login', async () => {
    const list = await request(app).get('/api/v1/catalog/products');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);

    const apparel = await request(app).get('/api/v1/catalog/products?category=Apparel');
    expect(apparel.status).toBe(200);
    expect(apparel.body.items.every((item) => item.category === 'Apparel')).toBe(true);

    const one = await request(app).get(`/api/v1/catalog/products/${product._id}`);
    expect(one.status).toBe(200);
    expect(one.body.name).toBe('Core Cotton Tee');
  });

  it('still requires auth for catalog kits', async () => {
    const res = await request(app).get('/api/v1/catalog/kits');
    expect(res.status).toBe(401);
  });
});
