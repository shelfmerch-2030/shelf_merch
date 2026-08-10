import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { OrderInvoice } from '../src/modules/orderInvoices/orderInvoice.model.js';
import { makeUser, seedTenantWorkspace, seedOrderForEntity } from './helpers/factories.js';

let app;

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('order-invoices API', () => {
  it('generates an invoice for an order and returns it by order id', async () => {
    const { tenant, token, entity, shop } = await seedTenantWorkspace({
      withShop: true,
      fundAmount: 0,
    });
    const { order } = await seedOrderForEntity({
      tenant,
      entity,
      shop,
      orderNumber: 'SM-INV-0001',
    });

    const missing = await request(app)
      .get(`/api/v1/order-invoices/by-order/${order._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(missing.status).toBe(404);

    const generated = await request(app)
      .post(`/api/v1/order-invoices/by-order/${order._id}/generate`)
      .set('Authorization', `Bearer ${token}`);
    expect(generated.status).toBe(201);
    expect(generated.body.orderId).toBeTruthy();
    expect(generated.body.pdfUrl || generated.body.invoiceNumber).toBeTruthy();

    const stored = await OrderInvoice.findOne({
      tenantId: tenant._id,
      orderId: order._id,
    });
    expect(stored).toBeTruthy();

    const fetched = await request(app)
      .get(`/api/v1/order-invoices/by-order/${order._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(String(fetched.body.orderId)).toBe(String(order._id));
  });

  it('entity manager without orders write cannot generate; read may list own entity orders invoice', async () => {
    const { tenant, entity, shop } = await seedTenantWorkspace({
      withShop: true,
      fundAmount: 0,
    });
    const { order } = await seedOrderForEntity({
      tenant,
      entity,
      shop,
      orderNumber: 'SM-INV-0002',
    });
    const { token: mgrToken } = await makeUser(tenant, 'entity_manager', 'entity', {
      assignedEntityIds: [entity._id],
    });

    const gen = await request(app)
      .post(`/api/v1/order-invoices/by-order/${order._id}/generate`)
      .set('Authorization', `Bearer ${mgrToken}`);
    expect(gen.status).toBe(403);
  });

  it('enforces tenant isolation', async () => {
    const a = await seedTenantWorkspace({
      name: 'A',
      slug: `inv-a-${Date.now()}`,
      withShop: true,
      fundAmount: 0,
    });
    const b = await seedTenantWorkspace({
      name: 'B',
      slug: `inv-b-${Date.now()}`,
      fundAmount: 0,
      withEntity: false,
    });
    const { order } = await seedOrderForEntity({
      tenant: a.tenant,
      entity: a.entity,
      shop: a.shop,
      orderNumber: 'SM-INV-ISO',
    });

    const res = await request(app)
      .post(`/api/v1/order-invoices/by-order/${order._id}/generate`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(
      '/api/v1/order-invoices/by-order/aaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(res.status).toBe(401);
  });
});
