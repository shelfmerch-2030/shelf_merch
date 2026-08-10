import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { WalletTransaction } from '../src/modules/wallets/walletTransaction.model.js';
import {
  makeUser,
  seedTenantWorkspace,
  allocateToEntity,
  ledger,
} from './helpers/factories.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('wallets API — balance, allocate, transfer, transactions', () => {
  it('returns wallet balance after funding and allocation', async () => {
    const { tenant, token, wallet, entity } = await seedTenantWorkspace({ fundAmount: 50_000 });
    await allocateToEntity({
      tenantId: tenant._id,
      walletId: wallet._id,
      entityId: entity._id,
      amount: 20_000,
    });

    const res = await request(app)
      .get(`/api/v1/wallets/${wallet._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(50_000);
    expect(res.body.allocatedAmount).toBe(20_000);

    const entityRes = await request(app)
      .get(`/api/v1/entities/${entity._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(entityRes.status).toBe(200);
    expect(entityRes.body.allocatedAmount).toBe(20_000);
  });

  it('rejects allocate that exceeds unallocated balance', async () => {
    const { token, wallet, entity } = await seedTenantWorkspace({ fundAmount: 10_000 });
    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ allocations: [{ entityId: String(entity._id), amount: 50_000 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ALLOCATION_EXCEEDS_BALANCE');
  });

  it('transfers cash between tenant wallets and lists transactions', async () => {
    const { tenant, token, wallet } = await seedTenantWorkspace({ fundAmount: 40_000 });
    const walletB = await Wallet.create({
      tenantId: tenant._id,
      name: 'Secondary',
      fundingDocument: { approvalStatus: 'approved' },
    });

    const transfer = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/transfer`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `xfer-${Date.now()}`)
      .send({ toWalletId: String(walletB._id), amount: 15_000 });
    expect(transfer.status).toBe(201);
    expect(transfer.body.wallet.balance).toBe(25_000);

    const freshB = await Wallet.findOne({ _id: walletB._id, tenantId: tenant._id });
    expect(freshB.balance).toBe(15_000);

    const txns = await request(app)
      .get(`/api/v1/wallets/${wallet._id}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 10 });
    expect(txns.status).toBe(200);
    expect(txns.body.items.length).toBeGreaterThanOrEqual(2);
    expect(txns.body.pagination.total).toBeGreaterThanOrEqual(2);

    const filtered = await request(app)
      .get(`/api/v1/wallets/${wallet._id}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .query({ type: 'transfer_between_wallets' });
    expect(filtered.status).toBe(200);
    expect(filtered.body.items.every((t) => t.type === 'transfer_between_wallets')).toBe(true);
  });

  it('rejects transfer that would strand entity allocations without cash', async () => {
    const { tenant, token, wallet, entity } = await seedTenantWorkspace({ fundAmount: 20_000 });
    await allocateToEntity({
      tenantId: tenant._id,
      walletId: wallet._id,
      entityId: entity._id,
      amount: 18_000,
    });
    const walletB = await Wallet.create({
      tenantId: tenant._id,
      name: 'Other',
      fundingDocument: { approvalStatus: 'approved' },
    });

    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/transfer`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `xfer-bad-${Date.now()}`)
      .send({ toWalletId: String(walletB._id), amount: 5_000 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('rejects online fund via /fund (must use Razorpay)', async () => {
    const { token, wallet } = await seedTenantWorkspace({ fundAmount: 0 });
    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1000, fundingMethod: 'online' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('USE_RAZORPAY');
  });

  it('PATCH renames wallet; DELETE removes only draft wallets', async () => {
    const { tenant, token } = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const draft = await Wallet.create({
      tenantId: tenant._id,
      name: 'Draft Wallet',
      status: 'draft',
    });

    const patched = await request(app)
      .patch(`/api/v1/wallets/${draft._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Draft' });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Renamed Draft');

    const removed = await request(app)
      .delete(`/api/v1/wallets/${draft._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(200);

    const funded = await Wallet.create({
      tenantId: tenant._id,
      name: 'Funded',
      status: 'wallet_created',
      fundingDocument: { approvalStatus: 'approved' },
    });
    await ledger.createTransaction({
      tenantId: tenant._id,
      walletId: funded._id,
      type: 'fund_in',
      amount: 1000,
    });
    const badDelete = await request(app)
      .delete(`/api/v1/wallets/${funded._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(badDelete.status).toBe(422);
    expect(badDelete.body.error.code).toBe('WALLET_NOT_DELETABLE');
  });

  it('ensure-spend-entity maps a spend entity onto the wallet', async () => {
    const { token, wallet } = await seedTenantWorkspace({ fundAmount: 5_000, withEntity: false });
    const res = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/ensure-spend-entity`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body._id || res.body.id || res.body.entity?._id).toBeTruthy();
    const entities = await Entity.find({ tenantId: wallet.tenantId, walletId: wallet._id });
    expect(entities.length).toBeGreaterThanOrEqual(1);
  });

  it('entity manager cannot transfer or allocate (RBAC)', async () => {
    const { tenant, wallet, entity } = await seedTenantWorkspace({ fundAmount: 10_000 });
    const { token } = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
    });
    const walletB = await Wallet.create({
      tenantId: tenant._id,
      name: 'B',
      fundingDocument: { approvalStatus: 'approved' },
    });

    const allocate = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ allocations: [{ entityId: String(entity._id), amount: 100 }] });
    expect(allocate.status).toBe(403);

    const transfer = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/transfer`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `mgr-xfer-${Date.now()}`)
      .send({ toWalletId: String(walletB._id), amount: 100 });
    expect(transfer.status).toBe(403);
  });
});

describe('wallets — concurrent debit safety', () => {
  it('only one of two concurrent overspend attempts succeeds', async () => {
    const { tenant, wallet, entity } = await seedTenantWorkspace({ fundAmount: 1_000 });
    await allocateToEntity({
      tenantId: tenant._id,
      walletId: wallet._id,
      entityId: entity._id,
      amount: 1_000,
    });

    const results = await Promise.allSettled([
      ledger.createTransaction({
        tenantId: tenant._id,
        walletId: wallet._id,
        type: 'campaign_spend',
        amount: -800,
        relatedEntityId: entity._id,
      }),
      ledger.createTransaction({
        tenantId: tenant._id,
        walletId: wallet._id,
        type: 'campaign_spend',
        amount: -800,
        relatedEntityId: entity._id,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const fresh = await Wallet.findOne({ _id: wallet._id, tenantId: tenant._id });
    expect(fresh.balance).toBe(200);
    const spendCount = await WalletTransaction.countDocuments({
      tenantId: tenant._id,
      walletId: wallet._id,
      type: 'campaign_spend',
    });
    expect(spendCount).toBe(1);
  });
});

describe('wallets — unauthorized / tenant isolation', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/wallets');
    expect(res.status).toBe(401);
  });

  it('tenant B cannot list or transfer tenant A wallets', async () => {
    const a = await seedTenantWorkspace({ name: 'A', slug: `a-${Date.now()}`, fundAmount: 10_000 });
    const b = await seedTenantWorkspace({
      name: 'B',
      slug: `b-${Date.now()}`,
      fundAmount: 5_000,
    });

    const list = await request(app)
      .get('/api/v1/wallets')
      .set('Authorization', `Bearer ${b.token}`);
    expect(list.body.every((w) => String(w.tenantId) === String(b.tenant._id))).toBe(true);

    const transfer = await request(app)
      .post(`/api/v1/wallets/${a.wallet._id}/transfer`)
      .set('Authorization', `Bearer ${b.token}`)
      .set('Idempotency-Key', `iso-${Date.now()}`)
      .send({ toWalletId: String(b.wallet._id), amount: 100 });
    expect(transfer.status).toBe(404);
  });
});
