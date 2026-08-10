import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import { errorHandler } from '../src/middleware/error.middleware.js';

let app;
let token;
let tenant;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix-dup' });
  const user = await User.create({
    tenantId: tenant._id,
    name: 'Admin',
    email: 'admin-dup@test.io',
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenant._id,
    userId: user._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  token = signAccessToken(user, assignment);
});

describe('duplicate shop / unique key conflicts', () => {
  it('auto-suffixes shop slugs on create so vanity URLs stay unique', async () => {
    const first = await request(app)
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Salesforce', slug: 'salesforce' });
    expect(first.status).toBe(201);
    expect(first.body.slug).toBe('salesforce');

    const second = await request(app)
      .post('/api/v1/shops')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Salesforce', slug: 'salesforce' });
    expect(second.status).toBe(201);
    expect(second.body.slug).toBe('salesforce-1');
  });

  it('returns field-aware DUPLICATE message for Mongo unique index conflicts', () => {
    const err = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyPattern: { slug: 1 },
    });
    const json = {};
    const resMock = {
      status(code) {
        json.status = code;
        return this;
      },
      json(body) {
        json.body = body;
        return this;
      },
    };
    errorHandler(err, { path: '/api/v1/shops' }, resMock, () => {});
    expect(json.status).toBe(409);
    expect(json.body.error.code).toBe('DUPLICATE');
    expect(json.body.error.message).toBe('A record with this slug already exists');
    expect(json.body.error.details).toEqual({ field: 'slug' });
  });
});
