import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import {
  makeTenant,
  makeUser,
  makeFundedWallet,
  makeEntity,
  authHeader,
  allowlistAuthEmails,
} from './helpers.js';
import { createApp } from '../src/app.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import * as ledger from '../src/services/ledger.service.js';

let app;
let tenant;
let adminToken;
let managerToken;
let wallet;
let entity;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'entity-suite' });
  ({ token: adminToken } = await makeUser(tenant, 'company_admin', 'tenant'));
  wallet = await makeFundedWallet(tenant, { amount: 200_000 });
  entity = await makeEntity(tenant, wallet, 'Marketing');
  ({ token: managerToken } = await makeUser(tenant, 'entity_manager', 'entity', {
    scopeId: entity._id,
    assignedEntityIds: [entity._id],
  }));
});

describe('entities API', () => {
  it('lists entities for company admin', async () => {
    await makeEntity(tenant, wallet, 'Sales');
    const res = await request(app).get('/api/v1/entities').set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.map((e) => e.name).sort()).toEqual(['Marketing', 'Sales']);
  });

  it('creates an entity mapped to a wallet', async () => {
    const res = await request(app)
      .post('/api/v1/entities')
      .set(authHeader(adminToken))
      .send({ walletId: String(wallet._id), name: 'HR', colorHex: '#112233' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('HR');
    expect(String(res.body.walletId)).toBe(String(wallet._id));
    expect(String(res.body.tenantId)).toBe(String(tenant._id));
  });

  it('requires auth and forbids entity manager create (RBAC)', async () => {
    expect((await request(app).get('/api/v1/entities')).status).toBe(401);

    const denied = await request(app)
      .post('/api/v1/entities')
      .set(authHeader(managerToken))
      .send({ walletId: String(wallet._id), name: 'Sneaky' });
    expect(denied.status).toBe(403);
  });

  it('enforces ABAC — manager cannot read unassigned entity', async () => {
    const sales = await makeEntity(tenant, wallet, 'Sales');
    const denied = await request(app)
      .get(`/api/v1/entities/${sales._id}`)
      .set(authHeader(managerToken));
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .get(`/api/v1/entities/${entity._id}`)
      .set(authHeader(managerToken));
    expect(allowed.status).toBe(200);
    expect(allowed.body.name).toBe('Marketing');
  });

  it('returns 404 for unknown entity', async () => {
    const res = await request(app)
      .get(`/api/v1/entities/${new mongoose.Types.ObjectId()}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(404);
  });

  it('assigns a manager and patches entity metadata', async () => {
    await allowlistAuthEmails('mgr-new@entity-suite.io');
    const assign = await request(app)
      .post(`/api/v1/entities/${entity._id}/assign-manager`)
      .set(authHeader(adminToken))
      .send({ name: 'Mgr New', email: 'mgr-new@entity-suite.io' });
    expect(assign.status).toBe(201);
    expect(assign.body.manager.email).toBe('mgr-new@entity-suite.io');

    const patch = await request(app)
      .patch(`/api/v1/entities/${entity._id}`)
      .set(authHeader(adminToken))
      .send({ description: 'Marketing dept' });
    expect(patch.status).toBe(200);
    expect(patch.body.description).toBe('Marketing dept');
  });

  it('blocks delete while entity has unspent budget', async () => {
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 50_000,
      relatedEntityId: entity._id,
    });
    const res = await request(app)
      .delete(`/api/v1/entities/${entity._id}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ENTITY_HAS_BUDGET');
  });

  it('deletes an entity with zero remaining budget', async () => {
    const empty = await makeEntity(tenant, wallet, 'Temp');
    const res = await request(app)
      .delete(`/api/v1/entities/${empty._id}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    const gone = await Entity.findOne({ _id: empty._id, tenantId: tenant._id });
    expect(gone).toBeNull();
  });

  it('lists entity transactions (entity–wallet mapping)', async () => {
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'allocation_to_entity',
      amount: 10_000,
      relatedEntityId: entity._id,
    });
    const res = await request(app)
      .get(`/api/v1/entities/${entity._id}/transactions`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.items?.length ?? res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('isolates entities across tenants', async () => {
    const other = await makeTenant({ slug: 'entity-other' });
    const { token } = await makeUser(other, 'company_admin', 'tenant');
    const res = await request(app)
      .get(`/api/v1/entities/${entity._id}`)
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });
});
