import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { Campaign } from '../src/modules/campaigns/campaign.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Recipient } from '../src/modules/campaigns/recipient.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Collection } from '../src/modules/collections/collection.model.js';
import { CatalogProduct } from '../src/modules/catalog/catalogProduct.model.js';
import { Vendor } from '../src/modules/vendors/vendor.model.js';
import { Shipment } from '../src/modules/shipments/shipment.model.js';
import { SupportTicket } from '../src/modules/support/supportTicket.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import * as ledger from '../src/services/ledger.service.js';

let app;
let tenant;
let wallet;
let adminToken;
let superAdminToken;
let productionManagerToken;
let order;

async function makeUser(tenantDoc, role, scopeType, extra = {}) {
  const user = await User.create({
    tenantId: tenantDoc?._id ?? null,
    name: `${role} user`,
    email: `${role}-${tenantDoc?.slug ?? 'platform'}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: tenantDoc?._id ?? null,
    userId: user._id,
    role,
    scopeType,
    ...extra,
  });
  return { user, token: signAccessToken(user, assignment) };
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
});
afterAll(disconnectTestDb);

beforeEach(async () => {
  await clearTestDb();
  tenant = await Tenant.create({ name: 'Rubix', slug: 'rubix' });
  wallet = await Wallet.create({ tenantId: tenant._id, name: 'Rubix Wallet' });
  await ledger.createTransaction({
    tenantId: tenant._id,
    walletId: wallet._id,
    type: 'fund_in',
    amount: 100_000,
  });

  const admin = await User.create({
    tenantId: tenant._id,
    name: 'Admin',
    email: 'admin@test.io',
    status: 'active',
  });
  adminToken = signAccessToken(
    admin,
    await RoleAssignment.create({
      tenantId: tenant._id,
      userId: admin._id,
      role: 'company_admin',
      scopeType: 'tenant',
    }),
  );

  ({ token: superAdminToken } = await makeUser(null, 'platform_super_admin', 'platform'));
  ({ token: productionManagerToken } = await makeUser(null, 'platform_production_manager', 'platform'));

  const entity = await Entity.create({ tenantId: tenant._id, walletId: wallet._id, name: 'Marketing' });
  const shop = await Shop.create({ tenantId: tenant._id, name: 'Rubix Shop', status: 'live' });
  const campaign = await Campaign.create({
    tenantId: tenant._id,
    entityId: entity._id,
    name: 'Gifts',
    type: 'points',
    shopId: shop._id,
    status: 'redemption_open',
    creditsPerRecipient: 1000,
    totalBudget: 1000,
    recipientCount: 1,
  });
  const recipient = await Recipient.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    name: 'Alice',
    email: 'alice@test.io',
    creditAmount: 1000,
    redemptionToken: 'token1',
    redemptionStatus: 'order_created',
  });

  order = await Order.create({
    tenantId: tenant._id,
    campaignId: campaign._id,
    recipientId: recipient._id,
    orderNumber: 'SM-2026-000001',
    items: [{ name: 'Test Tee', qty: 1, unitPriceInr: 500 }],
    shippingAddress: { name: 'Alice', line1: '123 St', city: 'Hyderabad', state: 'TS', pincode: '500001' },
    amountBreakdown: { subtotal: 500, serviceFee: 0, gst: 90, total: 590 },
    status: 'shipped',
  });
});

describe('impersonation endpoints', () => {
  it('super admin can start impersonation and gets a tenant-scoped token', async () => {
    const res = await request(app)
      .post(`/api/v1/platform/tenants/${tenant._id}/impersonate`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'Support ticket investigation', reasonCategory: 'support' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.expiresIn).toBe(900);
    expect(res.body.tenant.id).toBe(String(tenant._id));

    const wallets = await request(app)
      .get('/api/v1/wallets')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(wallets.status).toBe(200);
    expect(wallets.body.some((w) => String(w.tenantId) === String(tenant._id))).toBe(true);
  });

  it('non-super-admin cannot start impersonation', async () => {
    const res = await request(app)
      .post(`/api/v1/platform/tenants/${tenant._id}/impersonate`)
      .set('Authorization', `Bearer ${productionManagerToken}`)
      .send({ reason: 'Nope', reasonCategory: 'other' });
    expect(res.status).toBe(403);
  });

  it('blocks wallet funding during impersonation token from start endpoint', async () => {
    const start = await request(app)
      .post(`/api/v1/platform/tenants/${tenant._id}/impersonate`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'Debug', reasonCategory: 'support' });
    expect(start.status).toBe(200);

    const fund = await request(app)
      .post(`/api/v1/wallets/${wallet._id}/fund`)
      .set('Authorization', `Bearer ${start.body.accessToken}`)
      .send({ amount: 5000 });
    expect(fund.status).toBe(403);
    expect(fund.body.error.message).toMatch(/impersonation/i);
  });
});

describe('platform vendor assignment', () => {
  it('assigns an active vendor to an order', async () => {
    const vendor = await Vendor.create({ name: 'PrintCo', type: 'printing', status: 'active' });

    const res = await request(app)
      .patch(`/api/v1/platform/orders/${order._id}/assign-vendor`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ vendorId: vendor._id });
    expect(res.status).toBe(200);
    expect(String(res.body.vendorId)).toBe(String(vendor._id));
  });
});

describe('platform order detail fulfillment assets', () => {
  it('keeps artwork and mockups scoped to the ordered branded listing', async () => {
    const campaign = await Campaign.findById(order.campaignId);
    const product = await CatalogProduct.create({
      sku: 'APPT-1053',
      name: 'Corporate Polo',
      category: 'Apparel',
      group: 'tee',
      basePriceInr: 610,
      baseImageUrl: '/uploads/base-polo.png',
      maskImageUrl: '/uploads/mask-polo.png',
      printAreas: [
        {
          key: 'left',
          label: 'Left',
          xIn: 2,
          yIn: 3,
          widthIn: 2,
          heightIn: 2,
          box: { xPct: 20, yPct: 20, widthPct: 10, heightPct: 10 },
          methods: ['dtf'],
        },
      ],
    });

    const [appleCollection, googleCollection] = await Collection.create([
      {
        tenantId: tenant._id,
        shopId: campaign.shopId,
        code: 'C-APPLE',
        name: 'Apple Polo Design',
        status: 'ready',
        artworkUrl: '/uploads/apple-logo.png',
        productRefs: [
          {
            catalogProductId: product._id,
            name: 'Corporate Polo',
            mockupUrl: '/uploads/apple-polo-mockup.png',
            placement: { xPct: 10, yPct: 20, wPct: 15, rot: 0 },
          },
        ],
      },
      {
        tenantId: tenant._id,
        shopId: campaign.shopId,
        code: 'C-GOOGLE',
        name: 'Google Polo Design',
        status: 'ready',
        artworkUrl: '/uploads/google-logo.png',
        productRefs: [
          {
            catalogProductId: product._id,
            name: 'Corporate Polo',
            mockupUrl: '/uploads/google-polo-mockup.png',
            placement: { xPct: 35, yPct: 45, wPct: 18, rot: 0 },
          },
        ],
      },
    ]);

    const ordered = await Order.create({
      tenantId: tenant._id,
      campaignId: order.campaignId,
      recipientId: order.recipientId,
      orderNumber: 'SM-2026-000002',
      items: [
        {
          catalogProductId: product._id,
          collectionId: googleCollection._id,
          name: 'Corporate Polo',
          sku: 'APPT-1053',
          variant: { size: 'S', color: 'White' },
          qty: 1,
          unitPriceInr: 610,
          imageUrl: '/uploads/google-polo-mockup.png',
        },
      ],
      shippingAddress: { name: 'Alice', line1: '123 St', city: 'Hyderabad', state: 'TS', pincode: '500001' },
      amountBreakdown: { subtotal: 610, serviceFee: 0, gst: 110, total: 720 },
      status: 'mockup_approved',
    });

    const res = await request(app)
      .get(`/api/v1/platform/orders/${ordered._id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].collectionId).toBe(String(googleCollection._id));
    expect(res.body.items[0].collectionId).not.toBe(String(appleCollection._id));
    expect(res.body.items[0].artworkUrl).toBe('/uploads/google-logo.png');
    expect(res.body.items[0].placement.xPct).toBe(35);
    expect(res.body.items[0].product.designedMockupUrl).toBe('/uploads/google-polo-mockup.png');
  });
});

describe('shipment delivery advances order', () => {
  it('transitions order to delivered when shipment is delivered', async () => {
    const shipment = await Shipment.create({
      tenantId: tenant._id,
      orderId: order._id,
      courier: 'Delhivery',
      awb: 'AWB123',
      status: 'in_transit',
      events: [{ status: 'in_transit', location: 'Hub', at: new Date() }],
    });

    const res = await request(app)
      .post(`/api/v1/platform/shipments/${shipment._id}/events`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'delivered', location: 'Customer' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('delivered');

    const updated = await Order.findOne({ _id: order._id, tenantId: tenant._id });
    expect(updated.status).toBe('delivered');
    expect(updated.trackingNumber).toBe('AWB123');
  });
});

describe('platform support ticket status', () => {
  it('updates support ticket status through allowed transitions', async () => {
    const admin = await User.findOne({ email: 'admin@test.io' });
    const ticket = await SupportTicket.create({
      tenantId: tenant._id,
      raisedByUserId: admin._id,
      subject: 'Late delivery',
      description: 'Order not received',
      status: 'open',
    });

    const res = await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticket._id}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
  });
});
