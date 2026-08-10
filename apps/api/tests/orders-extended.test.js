import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import {
  makeUser,
  seedTenantWorkspace,
  seedOrderForEntity,
} from './helpers/factories.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('orders API — list filters, pagination, getOne', () => {
  it('filters by status and paginates', async () => {
    const { tenant, token, entity, shop } = await seedTenantWorkspace({
      withShop: true,
      fundAmount: 0,
    });
    await seedOrderForEntity({
      tenant,
      entity,
      shop,
      status: 'created',
      orderNumber: 'SM-PAGE-1',
      campaignName: 'C1',
    });
    await seedOrderForEntity({
      tenant,
      entity,
      shop,
      status: 'approved',
      orderNumber: 'SM-PAGE-2',
      campaignName: 'C2',
    });
    await seedOrderForEntity({
      tenant,
      entity,
      shop,
      status: 'created',
      orderNumber: 'SM-PAGE-3',
      campaignName: 'C3',
    });

    const filtered = await request(app)
      .get('/api/v1/orders')
      .query({ status: 'created' })
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.items).toHaveLength(2);
    expect(filtered.body.items.every((o) => o.status === 'created')).toBe(true);

    const page1 = await request(app)
      .get('/api/v1/orders')
      .query({ page: 1, limit: 2 })
      .set('Authorization', `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.pagination.total).toBe(3);
    expect(page1.body.pagination.page).toBe(1);
    expect(page1.body.pagination.limit).toBe(2);

    const page2 = await request(app)
      .get('/api/v1/orders')
      .query({ page: 2, limit: 2 })
      .set('Authorization', `Bearer ${token}`);
    expect(page2.body.items).toHaveLength(1);
  });

  it('getOne returns schema with validNextStatuses and ABAC denial', async () => {
    const { tenant, token, entity, shop, wallet } = await seedTenantWorkspace({
      withShop: true,
      fundAmount: 0,
    });
    const otherEntity = await Entity.create({
      tenantId: tenant._id,
      walletId: wallet._id,
      name: 'Sales',
    });

    const { order } = await seedOrderForEntity({
      tenant,
      entity,
      shop,
      orderNumber: 'SM-GET-1',
    });
    const other = await seedOrderForEntity({
      tenant,
      entity: otherEntity,
      shop,
      orderNumber: 'SM-GET-2',
      campaignName: 'Other Entity Campaign',
    });

    const ok = await request(app)
      .get(`/api/v1/orders/${order._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.orderNumber).toBe('SM-GET-1');
    expect(ok.body).toHaveProperty('validNextStatuses');
    expect(ok.body).toHaveProperty('amountBreakdown');
    expect(ok.body.internalNotes).toBeUndefined();

    const { token: mgrToken } = await makeUser(tenant, 'entity_manager', 'entity', {
      scopeId: entity._id,
      assignedEntityIds: [entity._id],
    });
    const allowed = await request(app)
      .get(`/api/v1/orders/${order._id}`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(allowed.status).toBe(200);

    const denied = await request(app)
      .get(`/api/v1/orders/${other.order._id}`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(denied.status).toBe(403);
  });

  it('returns 404 for unknown order id', async () => {
    const { token } = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const res = await request(app)
      .get('/api/v1/orders/aaaaaaaaaaaaaaaaaaaaaaaa')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated list and invalid status filter', async () => {
    const unauth = await request(app).get('/api/v1/orders');
    expect(unauth.status).toBe(401);

    const { token } = await seedTenantWorkspace({ fundAmount: 0, withEntity: false });
    const bad = await request(app)
      .get('/api/v1/orders')
      .query({ status: 'not_a_real_status' })
      .set('Authorization', `Bearer ${token}`);
    expect(bad.status).toBe(400);
  });
});

describe('orders API — status transitions & permissions', () => {
  it('company admin can raise issue; invalid status transition fails', async () => {
    const { tenant, token, entity, shop } = await seedTenantWorkspace({
      withShop: true,
      fundAmount: 0,
    });
    const { order } = await seedOrderForEntity({
      tenant,
      entity,
      shop,
      status: 'created',
      orderNumber: 'SM-TR-1',
    });

    const issue = await request(app)
      .patch(`/api/v1/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'issue_raised', note: 'Damaged box' });
    expect(issue.status).toBe(200);
    expect(issue.body.status).toBe('issue_raised');

    // Reset to mockup_pending then try illegal jump
    await Order.updateOne(
      { _id: order._id, tenantId: tenant._id },
      { status: 'mockup_pending' },
    );
    const illegal = await request(app)
      .patch(`/api/v1/orders/${order._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'shipped', note: 'nope' });
    expect(illegal.status).toBe(403);
    expect(illegal.body.error.code).toBe('PLATFORM_ONLY_TRANSITION');
  });

  it('enforces campaign/entity ABAC isolation across tenants', async () => {
    const a = await seedTenantWorkspace({
      name: 'A',
      slug: `ord-a-${Date.now()}`,
      withShop: true,
      fundAmount: 0,
    });
    const b = await seedTenantWorkspace({
      name: 'B',
      slug: `ord-b-${Date.now()}`,
      withShop: true,
      fundAmount: 0,
    });
    const { order } = await seedOrderForEntity({
      tenant: a.tenant,
      entity: a.entity,
      shop: a.shop,
      orderNumber: 'SM-ISO-1',
    });

    const cross = await request(app)
      .get(`/api/v1/orders/${order._id}`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(cross.status).toBe(404);

    const listB = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${b.token}`);
    expect(listB.body.items).toHaveLength(0);
  });
});
