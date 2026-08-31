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
let adminToken;
let managerToken;
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
  adminToken = await makeUser(tenant, 'company_admin', 'tenant');
  managerToken = await makeUser(tenant, 'entity_manager', 'tenant');
  product = await CatalogProduct.create({
    sku: `SM-TEE-${Date.now()}`,
    name: 'Core Cotton Tee',
    category: 'Apparel',
    basePriceInr: 499,
    variants: [{ size: 'M', color: 'Black', sku: 'SM-TEE-BLK-M' }],
  });
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function seedActiveKit(name, imageUrls = []) {
  const kit = await PlatformKit.create({
    name,
    description: 'Ready-to-send onboarding bundle',
    approxValueInr: 1500,
    imageUrls,
    items: [{ catalogProductId: product._id, variantSku: 'SM-TEE-BLK-M', qty: 1 }],
    status: 'active',
  });
  return kit;
}

describe('tenant catalog kits (platform curated)', () => {
  it('lists only active platform kits for company_admin', async () => {
    const active = await seedActiveKit('New Joiner Kit');
    await PlatformKit.create({ name: 'Draft kit', status: 'draft' });
    await PlatformKit.create({ name: 'Archived kit', status: 'archived' });

    const res = await request(app).get('/api/v1/catalog/kits').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]._id).toBe(String(active._id));
    expect(res.body[0].name).toBe('New Joiner Kit');
    expect(res.body[0].description).toBe('Ready-to-send onboarding bundle');
    expect(res.body[0].items).toHaveLength(1);
  });

  it('returns kit cover images for tenant catalog kits', async () => {
    await seedActiveKit('Imaged Kit', ['/uploads/platform/product/cover.png', '/uploads/platform/product/alt.png']);

    const res = await request(app).get('/api/v1/catalog/kits').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body[0].imageUrls).toEqual([
      '/uploads/platform/product/cover.png',
      '/uploads/platform/product/alt.png',
    ]);
  });

  it('lists active platform kits for entity_manager', async () => {
    await seedActiveKit('Field Sales Kit');

    const res = await request(app).get('/api/v1/catalog/kits').set(auth(managerToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Field Sales Kit');
  });

  it('returns a single active kit by id', async () => {
    const kit = await seedActiveKit('Welcome Kit');

    const res = await request(app).get(`/api/v1/catalog/kits/${kit._id}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Welcome Kit');
  });

  it('returns 404 for draft kits', async () => {
    const draft = await PlatformKit.create({ name: 'Draft only', status: 'draft' });

    const res = await request(app).get(`/api/v1/catalog/kits/${draft._id}`).set(auth(adminToken));
    expect(res.status).toBe(404);
  });

  it('forbids platform catalog admin without tenant role from tenant catalog kits', async () => {
    await seedActiveKit('Hidden from platform role');

    const res = await request(app).get('/api/v1/catalog/kits').set(auth(catalogToken));
    expect(res.status).toBe(403);
  });
});

describe('public catalog kits browse', () => {
  it('lists active platform kits without authentication', async () => {
    const active = await seedActiveKit('Public Welcome Kit', ['/uploads/platform/product/cover.png']);
    await PlatformKit.create({ name: 'Draft kit', status: 'draft' });

    const res = await request(app).get('/api/v1/catalog/kits/public');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]._id).toBe(String(active._id));
    expect(res.body[0].name).toBe('Public Welcome Kit');
    expect(res.body[0].imageUrls).toEqual(['/uploads/platform/product/cover.png']);
  });
});
