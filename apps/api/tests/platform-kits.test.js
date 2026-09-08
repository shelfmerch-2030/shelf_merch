import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { PlatformKit } from '../src/modules/kits/platformKit.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';

let app;
let catalogToken;
let tenantToken;
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
  tenantToken = await makeUser(tenant, 'company_admin', 'tenant');
  product = await CatalogProduct.create({
    sku: `SM-TEE-${Date.now()}`,
    name: 'Core Cotton Tee',
    category: 'Apparel',
    basePriceInr: 499,
    variants: [{ size: 'M', color: 'Black', sku: 'SM-TEE-BLK-M' }],
  });
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('platform kit creation (predefined curated kits)', () => {
  it('creates a kit with rules, adds an item (product+variant+qty), and publishes', async () => {
    const created = await request(app)
      .post('/api/v1/platform/kits')
      .set(auth(catalogToken))
      .send({
        name: 'New Joiner Kit',
        packaging: 'premium_box',
        eligibleCampaignTypes: ['Employee onboarding'],
        approxValueInr: 1500,
        rules: { fixedComposition: true, customizationAllowed: false, minQtyPerRecipient: 1, maxQtyPerRecipient: 2 },
      });
    expect(created.status).toBe(201);
    const kitId = created.body._id;
    expect(created.body.rules.customizationAllowed).toBe(false);
    expect(created.body.rules.maxQtyPerRecipient).toBe(2);

    // Cannot publish an empty kit.
    const earlyPublish = await request(app)
      .post(`/api/v1/platform/kits/${kitId}/publish`)
      .set(auth(catalogToken));
    expect(earlyPublish.status).toBe(422);
    expect(earlyPublish.body.error.code).toBe('KIT_EMPTY');

    // Add an item.
    const addItem = await request(app)
      .post(`/api/v1/platform/kits/${kitId}/items`)
      .set(auth(catalogToken))
      .send({ catalogProductId: String(product._id), variantSku: 'SM-TEE-BLK-M', qty: 2 });
    expect(addItem.status).toBe(201);
    expect(addItem.body).toHaveLength(1);
    expect(addItem.body[0].variantSku).toBe('SM-TEE-BLK-M');

    // Now publish succeeds.
    const publish = await request(app)
      .post(`/api/v1/platform/kits/${kitId}/publish`)
      .set(auth(catalogToken));
    expect(publish.status).toBe(200);
    expect(publish.body.status).toBe('active');
  });

  it('publishes an imported (curated) kit without items', async () => {
    const kit = await PlatformKit.create({
      name: 'Welcome Aboard Employee Kit',
      approxValueInr: 1200,
      items: [],
      source: { provider: 'shopify', externalId: '99001', domain: 'demo.myshopify.com' },
    });
    const publish = await request(app)
      .post(`/api/v1/platform/kits/${kit._id}/publish`)
      .set(auth(catalogToken));
    expect(publish.status).toBe(200);
    expect(publish.body.status).toBe('active');
  });

  it('forbids a tenant role from creating a platform kit (403)', async () => {
    const res = await request(app)
      .post('/api/v1/platform/kits')
      .set(auth(tenantToken))
      .send({ name: 'Sneaky kit' });
    expect(res.status).toBe(403);
  });

  it('removes a kit image from the gallery and any roles that used it', async () => {
    const kit = await PlatformKit.create({
      name: 'Photo kit',
      approxValueInr: 400,
      imageUrls: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
      heroImage: 'https://cdn.example/a.jpg',
      galleryImages: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
      itemImages: [{ imageUrl: 'https://cdn.example/a.jpg', label: 'Pen' }],
      variantImages: [{ imageUrl: 'https://cdn.example/b.jpg', label: 'Blue' }],
    });

    const res = await request(app)
      .delete(`/api/v1/platform/kits/${kit._id}/images`)
      .set(auth(catalogToken))
      .send({ imageUrl: 'https://cdn.example/a.jpg' });

    expect(res.status).toBe(200);
    expect(res.body.imageUrls).toEqual(['https://cdn.example/b.jpg']);
    expect(res.body.heroImage).toBe('https://cdn.example/b.jpg');
    expect(res.body.galleryImages).toEqual(['https://cdn.example/b.jpg']);
    expect(res.body.itemImages).toEqual([]);
    expect(res.body.variantImages).toHaveLength(1);
    expect(res.body.variantImages[0].imageUrl).toBe('https://cdn.example/b.jpg');
  });

  it('allows deleting the last kit image', async () => {
    const kit = await PlatformKit.create({
      name: 'Last photo kit',
      imageUrls: ['https://cdn.example/only.jpg'],
      heroImage: 'https://cdn.example/only.jpg',
      galleryImages: ['https://cdn.example/only.jpg'],
    });

    const res = await request(app)
      .delete(`/api/v1/platform/kits/${kit._id}/images`)
      .set(auth(catalogToken))
      .send({ imageUrl: 'https://cdn.example/only.jpg' });

    expect(res.status).toBe(200);
    expect(res.body.imageUrls).toEqual([]);
    expect(res.body.heroImage).toBe('');
    expect(res.body.galleryImages).toEqual([]);
  });

  it('returns 404 when the kit image is not in the gallery', async () => {
    const kit = await PlatformKit.create({
      name: 'Empty photo kit',
      imageUrls: ['https://cdn.example/kept.jpg'],
    });

    const res = await request(app)
      .delete(`/api/v1/platform/kits/${kit._id}/images`)
      .set(auth(catalogToken))
      .send({ imageUrl: 'https://cdn.example/missing.jpg' });

    expect(res.status).toBe(404);
  });
});
