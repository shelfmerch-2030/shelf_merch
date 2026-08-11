import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import {
  makeTenant,
  makeUser,
  makeFundedWallet,
  makeEntity,
  makeShop,
  authHeader,
} from './helpers.js';
import { createApp } from '../src/app.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import * as ledger from '../src/services/ledger.service.js';

let app;
let tenant;
let adminToken;
let managerToken;
let otherManagerToken;
let wallet;
let entity;
let otherEntity;
let shop;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await makeTenant({ slug: 'camp-life' });
  ({ token: adminToken } = await makeUser(tenant, 'company_admin', 'tenant'));
  wallet = await makeFundedWallet(tenant, { amount: 1_000_000 });
  entity = await makeEntity(tenant, wallet, 'Marketing');
  otherEntity = await makeEntity(tenant, wallet, 'Sales');
  await ledger.createTransaction({
    tenantId: tenant._id,
    walletId: wallet._id,
    type: 'allocation_to_entity',
    amount: 500_000,
    relatedEntityId: entity._id,
  });
  shop = await makeShop(tenant);
  ({ token: managerToken } = await makeUser(tenant, 'entity_manager', 'entity', {
    scopeId: entity._id,
    assignedEntityIds: [entity._id],
  }));
  ({ token: otherManagerToken } = await makeUser(tenant, 'entity_manager', 'entity', {
    scopeId: otherEntity._id,
    assignedEntityIds: [otherEntity._id],
  }));
});

async function seedOpenCampaign(overrides = {}) {
  return Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    name: 'Diwali',
    type: 'points',
    shopId: shop._id,
    status: 'redemption_open',
    creditsPerRecipient: 1000,
    totalBudget: 1000,
    recipientCount: 1,
    ...overrides,
  });
}

describe('campaigns — creation, mapping, close, transitions', () => {
  it('creates a campaign bound to an entity (budget mapping)', async () => {
    const res = await request(app)
      .post('/api/v1/campaigns')
      .set(authHeader(adminToken))
      .send({ entityId: String(entity._id), name: 'New Hire Kit', type: 'points' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(String(res.body.entityId)).toBe(String(entity._id));
    expect(String(res.body.tenantId)).toBe(String(tenant._id));
  });

  it('requires authentication (401) and validates body (400)', async () => {
    expect((await request(app).post('/api/v1/campaigns').send({})).status).toBe(401);

    const bad = await request(app)
      .post('/api/v1/campaigns')
      .set(authHeader(adminToken))
      .send({ name: 'Missing entity' });
    expect(bad.status).toBe(400);
  });

  it('entity manager cannot create campaign for unassigned entity (ABAC 403)', async () => {
    const res = await request(app)
      .post('/api/v1/campaigns')
      .set(authHeader(managerToken))
      .send({ entityId: String(otherEntity._id), name: 'Cross', type: 'points' });
    expect(res.status).toBe(403);
  });

  it('imports recipients and updates recipient count', async () => {
    const created = await request(app)
      .post('/api/v1/campaigns')
      .set(authHeader(adminToken))
      .send({ entityId: String(entity._id), name: 'Recipients', type: 'points' });
    const id = created.body._id;

    const imported = await request(app)
      .post(`/api/v1/campaigns/${id}/recipients/import`)
      .set(authHeader(adminToken))
      .send({
        recipients: [
          { name: 'Alice', email: 'alice@camp-life.io' },
          { name: 'Bob', email: 'bob@camp-life.io' },
        ],
      });
    expect(imported.status).toBe(200);
    expect(imported.body.count).toBe(2);

    const count = await Recipient.countDocuments({ tenantId: tenant._id, campaignId: id });
    expect(count).toBe(2);

    const campaign = await Campaign.findOne({ _id: id, tenantId: tenant._id });
    expect(campaign.status).toBe('recipients_uploaded');
  });

  it('closes an open redemption campaign', async () => {
    const campaign = await seedOpenCampaign();
    await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Alice',
      email: 'alice@camp-life.io',
      creditAmount: 1000,
      redemptionToken: 'close-token-1',
      redemptionStatus: 'invited',
    });

    const res = await request(app)
      .post(`/api/v1/campaigns/${campaign._id}/close`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('redemption_closed');

    const stored = await Campaign.findOne({ _id: campaign._id, tenantId: tenant._id });
    expect(stored.status).toBe('redemption_closed');
  });

  it('rejects invalid campaign close transition from draft', async () => {
    const created = await request(app)
      .post('/api/v1/campaigns')
      .set(authHeader(adminToken))
      .send({ entityId: String(entity._id), name: 'Draft Close', type: 'points' });

    const res = await request(app)
      .post(`/api/v1/campaigns/${created.body._id}/close`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('entity manager from another entity cannot close (ABAC 403)', async () => {
    const campaign = await seedOpenCampaign();
    const res = await request(app)
      .post(`/api/v1/campaigns/${campaign._id}/close`)
      .set(authHeader(otherManagerToken));
    expect(res.status).toBe(403);
  });

  it('returns campaign report for authorized readers', async () => {
    const campaign = await seedOpenCampaign();
    await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'Alice',
      email: 'alice@camp-life.io',
      creditAmount: 1000,
      redemptionToken: 'report-token',
      redemptionStatus: 'invited',
    });

    const res = await request(app)
      .get(`/api/v1/campaigns/${campaign._id}/report`)
      .set(authHeader(managerToken));
    expect(res.status).toBe(200);
    expect(res.body.recipients).toHaveLength(1);
    expect(res.body.recipients[0].email).toBe('alice@camp-life.io');
  });

  it('returns 404 for unknown campaign', async () => {
    const res = await request(app)
      .get(`/api/v1/campaigns/${new mongoose.Types.ObjectId()}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(404);
  });

  it('isolates campaigns across tenants', async () => {
    const campaign = await seedOpenCampaign();
    const other = await makeTenant({ slug: 'camp-other' });
    const { token } = await makeUser(other, 'company_admin', 'tenant');
    const res = await request(app)
      .get(`/api/v1/campaigns/${campaign._id}`)
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('lists only campaigns in the manager entity scope', async () => {
    await seedOpenCampaign({ name: 'Marketing Send' });
    await Campaign.create({
      tenantId: tenant._id,
      entityId: otherEntity._id,
      name: 'Sales Send',
      type: 'points',
      shopId: shop._id,
      status: 'draft',
      creditsPerRecipient: 500,
      totalBudget: 0,
      recipientCount: 0,
    });

    const res = await request(app).get('/api/v1/campaigns').set(authHeader(managerToken));
    expect(res.status).toBe(200);
    const names = res.body.map((c) => c.name);
    expect(names).toContain('Marketing Send');
    expect(names).not.toContain('Sales Send');
  });
});
