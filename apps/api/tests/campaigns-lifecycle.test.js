import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import {
  makeUser,
  seedTenantWorkspace,
  allocateToEntity,
  uniqueEmail,
} from './helpers/factories.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

async function seedApprovedCampaign({
  fundWallet = 100_000,
  allocate = 50_000,
  creditsPerRecipient = 1_000,
  recipientCount = 1,
} = {}) {
  const ctx = await seedTenantWorkspace({ withShop: true, fundAmount: fundWallet });
  await allocateToEntity({
    tenantId: ctx.tenant._id,
    walletId: ctx.wallet._id,
    entityId: ctx.entity._id,
    amount: allocate,
  });

  const created = await request(app)
    .post('/api/v1/campaigns')
    .set('Authorization', `Bearer ${ctx.token}`)
    .send({
      entityId: String(ctx.entity._id),
      name: 'Lifecycle Campaign',
      type: 'points',
      shopId: String(ctx.shop._id),
    });
  expect(created.status).toBe(201);
  const campaignId = created.body._id;

  const importRes = await request(app)
    .post(`/api/v1/campaigns/${campaignId}/recipients/import`)
    .set('Authorization', `Bearer ${ctx.token}`)
    .send({
      recipients: Array.from({ length: recipientCount }, (_, i) => ({
        name: `Person ${i}`,
        email: uniqueEmail(`person${i}`),
      })),
    });
  expect(importRes.status).toBe(200);

  const alloc = await request(app)
    .post(`/api/v1/campaigns/${campaignId}/allocate-credits`)
    .set('Authorization', `Bearer ${ctx.token}`)
    .send({ creditsPerRecipient });
  expect(alloc.status).toBe(200);
  expect(alloc.body.status).toBe('approved');

  return { ...ctx, campaignId };
}

describe('campaigns API — lifecycle close, report, locks', () => {
  it('launches, reports, and closes a campaign', async () => {
    const { token, campaignId } = await seedApprovedCampaign();

    const launch = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/launch`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `launch-${campaignId}`)
      .send({});
    expect(launch.status).toBe(200);
    expect(launch.body.status).toBe('redemption_open');

    const report = await request(app)
      .get(`/api/v1/campaigns/${campaignId}/report`)
      .set('Authorization', `Bearer ${token}`);
    expect(report.status).toBe(200);
    expect(report.body.recipients).toHaveLength(1);
    expect(report.body.recipients[0]).toHaveProperty('redemptionStatus');

    const close = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/close`)
      .set('Authorization', `Bearer ${token}`);
    expect(close.status).toBe(200);
    expect(close.body.status).toBe('redemption_closed');

    const closeAgain = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/close`)
      .set('Authorization', `Bearer ${token}`);
    expect(closeAgain.status).toBe(422);
    expect(closeAgain.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('rejects launch when campaign is not approved', async () => {
    const { tenant, token, entity, shop } = await seedTenantWorkspace({
      withShop: true,
      fundAmount: 10_000,
    });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Draft Only',
      type: 'points',
      shopId: shop._id,
      status: 'draft',
    });

    const res = await request(app)
      .post(`/api/v1/campaigns/${campaign._id}/launch`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `bad-launch-${campaign._id}`)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CAMPAIGN_NOT_APPROVED');
  });

  it('rejects launch when wallet/entity budget is insufficient', async () => {
    const { tenant, token, entity, shop, wallet } = await seedTenantWorkspace({
      withShop: true,
      fundAmount: 1_000,
    });
    await allocateToEntity({
      tenantId: tenant._id,
      walletId: wallet._id,
      entityId: entity._id,
      amount: 1_000,
    });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Too Expensive',
      type: 'points',
      shopId: shop._id,
      status: 'approved',
      creditsPerRecipient: 50_000,
      totalBudget: 50_000,
      recipientCount: 1,
    });
    await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'R',
      email: uniqueEmail('broke'),
      creditAmount: 50_000,
      redemptionToken: `tok-${Date.now()}`,
      redemptionStatus: 'invited',
    });

    const res = await request(app)
      .post(`/api/v1/campaigns/${campaign._id}/launch`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `nofunds-${campaign._id}`)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');

    const fresh = await (
      await import('../src/modules/wallets/wallet.model.js')
    ).Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(fresh.balance).toBe(1_000);
  });

  it('blocks entityId change and delete after launch (CAMPAIGN_LOCKED)', async () => {
    const { tenant, token, entity, shop, wallet, campaignId } = await seedApprovedCampaign();
    const otherEntity = await Entity.create({
      tenantId: tenant._id,
      walletId: wallet._id,
      name: 'Sales',
    });

    await request(app)
      .post(`/api/v1/campaigns/${campaignId}/launch`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `lock-${campaignId}`)
      .send({});

    const patch = await request(app)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entityId: String(otherEntity._id) });
    expect(patch.status).toBe(422);
    expect(patch.body.error.code).toBe('CAMPAIGN_LOCKED');

    const del = await request(app)
      .delete(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(422);
    expect(del.body.error.code).toBe('CAMPAIGN_LOCKED');

    // getOne + PATCH name while open should still work
    const get = await request(app)
      .get(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.entityId).toBeTruthy();

    const rename = await request(app)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Live Campaign' });
    expect(rename.status).toBe(200);
    expect(rename.body.name).toBe('Renamed Live Campaign');

    void entity;
    void shop;
  });

  it('entity manager cannot close another entity campaign (ABAC)', async () => {
    const { tenant, entity, shop, wallet } = await seedTenantWorkspace({
      withShop: true,
      fundAmount: 10_000,
    });
    await allocateToEntity({
      tenantId: tenant._id,
      walletId: wallet._id,
      entityId: entity._id,
      amount: 5_000,
    });
    const other = await Entity.create({
      tenantId: tenant._id,
      walletId: wallet._id,
      name: 'Other',
    });
    const campaign = await Campaign.create({
      tenantId: tenant._id,
      entityId: entity._id,
      name: 'Open',
      type: 'points',
      shopId: shop._id,
      status: 'redemption_open',
      totalBudget: 1000,
      creditsPerRecipient: 1000,
      recipientCount: 1,
    });
    await Recipient.create({
      tenantId: tenant._id,
      campaignId: campaign._id,
      name: 'R',
      email: uniqueEmail('r'),
      creditAmount: 1000,
      redemptionToken: `t-${Date.now()}`,
      redemptionStatus: 'invited',
    });

    const { token: mgrToken } = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [other._id],
    });
    const res = await request(app)
      .post(`/api/v1/campaigns/${campaign._id}/close`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(res.status).toBe(403);
  });

  it('idempotent launch returns the same open campaign', async () => {
    const { token, campaignId } = await seedApprovedCampaign();
    const key = `idem-launch-${campaignId}`;
    const first = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/launch`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({});
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/launch`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.status).toBe(first.body.status);
  });

  it('tenant isolation: cannot get or close another tenant campaign', async () => {
    const a = await seedApprovedCampaign();
    const b = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });

    const get = await request(app)
      .get(`/api/v1/campaigns/${a.campaignId}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(get.status).toBe(404);

    const close = await request(app)
      .post(`/api/v1/campaigns/${a.campaignId}/close`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(close.status).toBe(404);
  });
});
