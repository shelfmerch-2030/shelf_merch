/**
 * Phase 1 tenant management — status transitions, list filters, pagination,
 * RBAC, primary admin, and legacy trial safety.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { AuditLog } from '../src/modules/auditLogs/auditLog.model.js';
import { signAccessToken, hashPassword } from '../src/modules/auth/auth.service.js';

let app;
let tenant;
let adminToken;
let superToken;
let financeToken;

async function makeUser(tenantDoc, role, scopeType, extra = {}) {
  const user = await User.create({
    tenantId: tenantDoc?._id ?? null,
    name: `${role} user`,
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
    ...extra,
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenantDoc?._id ?? null,
    userId: user._id,
    role,
    scopeType,
  });
  return { user, token: signAccessToken(user, assignment) };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Dell', slug: 'dell', status: 'active' });
  await Wallet.create({ tenantId: tenant._id, name: 'Dell Wallet' });

  const admin = await makeUser(tenant, 'company_admin', 'tenant', { email: 'admin@dell.test', name: 'Dell Admin' });
  adminToken = admin.token;
  await Tenant.updateOne({ _id: tenant._id }, { primaryAdminUserId: admin.user._id });

  const superAdmin = await makeUser(null, 'platform_super_admin', 'platform');
  superToken = superAdmin.token;
  const finance = await makeUser(null, 'platform_finance_admin', 'platform');
  financeToken = finance.token;
});

describe('Phase 1 tenant list', () => {
  it('defaults to all statuses including archived and suspended', async () => {
    await Tenant.create({ name: 'Archived Co', slug: 'archived-co', status: 'archived' });
    await Tenant.create({ name: 'Suspended Co', slug: 'suspended-co', status: 'suspended' });

    const res = await request(app).get('/api/v1/platform/tenants').set(auth(superToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('pagination');
    const slugs = res.body.items.map((t) => t.slug);
    expect(slugs).toContain('dell');
    expect(slugs).toContain('suspended-co');
    expect(slugs).toContain('archived-co');
  });

  it('filters archived when requested and supports search + pagination', async () => {
    await Tenant.create({ name: 'Archived Co', slug: 'archived-co', status: 'archived' });
    for (let i = 0; i < 5; i += 1) {
      await Tenant.create({ name: `Extra ${i}`, slug: `extra-${i}`, status: 'active' });
    }

    const archived = await request(app)
      .get('/api/v1/platform/tenants?status=archived')
      .set(auth(superToken));
    expect(archived.body.items.every((t) => t.status === 'archived')).toBe(true);

    const search = await request(app)
      .get('/api/v1/platform/tenants?search=dell')
      .set(auth(superToken));
    expect(search.body.items.some((t) => t.slug === 'dell')).toBe(true);

    const page = await request(app)
      .get('/api/v1/platform/tenants?page=1&limit=2&sort=name&order=asc')
      .set(auth(superToken));
    expect(page.body.items).toHaveLength(2);
    expect(page.body.pagination.limit).toBe(2);
    expect(page.body.pagination.total).toBeGreaterThanOrEqual(6);
  });

  it('includes primary admin, user count, and does not crash on legacy trial', async () => {
    await Tenant.create({ name: 'Trial Co', slug: 'trial-co', status: 'trial' });
    const res = await request(app)
      .get('/api/v1/platform/tenants?status=all')
      .set(auth(superToken));
    expect(res.status).toBe(200);
    const dell = res.body.items.find((t) => t.slug === 'dell');
    expect(dell.primaryAdmin?.email).toBe('admin@dell.test');
    expect(dell.userCount).toBeGreaterThanOrEqual(1);
    const trial = res.body.items.find((t) => t.slug === 'trial-co');
    expect(trial.status).toBe('trial');
  });
});

describe('Phase 1 status transitions', () => {
  it('requires a reason to suspend and archive', async () => {
    const noReason = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/status`)
      .set(auth(superToken))
      .send({ status: 'suspended' });
    expect(noReason.status).toBe(400);

    await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/status`)
      .set(auth(superToken))
      .send({ status: 'suspended', reason: 'Non-payment' })
      .expect(200);

    const logs = await AuditLog.find({ entityId: tenant._id, action: 'tenant.suspended' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].before.status).toBe('active');
    expect(logs[0].after.status).toBe('suspended');
  });

  it('rejects invalid transitions and requires reason to restore', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { status: 'archived' });

    const bad = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/status`)
      .set(auth(superToken))
      .send({ status: 'suspended', reason: 'Nope' });
    expect(bad.status).toBe(422);

    const noReason = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/status`)
      .set(auth(superToken))
      .send({ status: 'active' });
    expect(noReason.status).toBe(400);

    await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/status`)
      .set(auth(superToken))
      .send({ status: 'active', reason: 'Customer returned' })
      .expect(200);

    const restored = await Tenant.findById(tenant._id);
    expect(restored.status).toBe('active');
  });

  it('blocks suspended tenant login and API access; platform admin retains access', async () => {
    await Tenant.updateOne({ _id: tenant._id }, { status: 'suspended' });
    const passwordHash = await hashPassword('demo1234');
    const user = await User.create({
      tenantId: tenant._id,
      name: 'Locked',
      email: 'locked@dell.test',
      passwordHash,
      status: 'active',
    });
    await RoleAssignment.create({
      tenantId: tenant._id,
      userId: user._id,
      role: 'company_admin',
      scopeType: 'tenant',
    });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'locked@dell.test', password: 'demo1234' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('TENANT_SUSPENDED');
    expect(login.body.error.message).toMatch(/suspended/i);

    const me = await request(app).get('/api/v1/tenants/me').set(auth(adminToken));
    expect(me.status).toBe(401);

    const overview = await request(app)
      .get(`/api/v1/platform/tenants/${tenant._id}/overview`)
      .set(auth(superToken));
    expect(overview.status).toBe(200);
  });

  it('platform finance cannot change tenant status; tenant admin cannot access platform APIs', async () => {
    const financeRes = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/status`)
      .set(auth(financeToken))
      .send({ status: 'suspended', reason: 'Nope' });
    expect(financeRes.status).toBe(403);

    const tenantRes = await request(app)
      .get('/api/v1/platform/tenants')
      .set(auth(adminToken));
    expect(tenantRes.status).toBe(403);
  });
});

describe('Phase 1 primary admin and slug', () => {
  it('assigns primary admin and rejects duplicate slugs', async () => {
    const other = await makeUser(tenant, 'company_admin', 'tenant', {
      email: 'other@dell.test',
      name: 'Other Admin',
    });

    const res = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}/primary-admin`)
      .set(auth(superToken))
      .send({ userId: String(other.user._id), reason: 'Handover' });
    expect(res.status).toBe(200);
    expect(res.body.primaryAdmin.email).toBe('other@dell.test');

    await Tenant.create({ name: 'Taken', slug: 'taken', status: 'active' });
    const slug = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant._id}`)
      .set(auth(superToken))
      .send({ slug: 'taken', confirmSlugChange: true });
    expect(slug.status).toBe(409);
  });

  it('does not enforce user count quotas on informational userCount', async () => {
    for (let i = 0; i < 12; i += 1) {
      await makeUser(tenant, 'company_admin', 'tenant');
    }
    const res = await request(app)
      .get(`/api/v1/platform/tenants/${tenant._id}`)
      .set(auth(superToken));
    expect(res.status).toBe(200);
    expect(res.body.userCount).toBeGreaterThan(10);
  });
});
