import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Entity } from '../src/modules/entities/entity.model.js';
import { Wallet } from '../src/modules/wallets/wallet.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Shipment } from '../src/modules/shipments/shipment.model.js';
import { Shop } from '../src/modules/shops/shop.model.js';
import { signAccessToken } from '../src/modules/auth/auth.service.js';
import { encryptToken } from '../src/utils/tokenEncryption.js';
import { SlackConnection } from '../src/modules/integrations/slack/slackConnection.model.js';
import { SlackNotificationReceipt } from '../src/modules/integrations/slack/slackNotificationReceipt.model.js';
import {
  flushPendingSlackNotifications,
  scheduleSlackBusinessNotification,
  evaluateEntityLowBudgetAlert,
  deliverSlackBusinessNotification,
  notifyOrderDispatched,
} from '../src/modules/integrations/slack/slackNotify.service.js';
import { SLACK_EVENT_TYPES } from '../src/modules/integrations/slack/slack.events.js';
import { approveFunding } from '../src/modules/platform/finance.service.js';
import { allocate } from '../src/modules/wallets/wallets.service.js';
import { addShipmentEvent } from '../src/modules/shipments/shipments.service.js';
import { publishShop } from '../src/modules/shops/shops.service.js';
import * as envModule from '../src/config/env.js';
import { SLACK_CHAT_POST_MESSAGE_URL } from '../src/modules/integrations/slack/slack.constants.js';

let app;
let tenantA;
let tenantB;
let adminA;
let adminToken;
let managerToken;
let fetchMock;

function mockJson(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

async function makeUser(role, scopeType, forTenant = tenantA) {
  const user = await User.create({
    tenantId: forTenant._id,
    name: `${role} user`,
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.io`,
    status: 'active',
  });
  const assignment = await RoleAssignment.create({
    tenantId: forTenant._id,
    userId: user._id,
    role,
    scopeType,
  });
  return { user, token: signAccessToken(user, assignment) };
}

async function seedSlack(forTenant, installedBy, overrides = {}) {
  const { botToken, ...rest } = overrides;
  return SlackConnection.create({
    tenantId: forTenant._id,
    teamId: `T_${String(forTenant._id).slice(-6)}`,
    teamName: `${forTenant.name} Slack`,
    encryptedBotToken: encryptToken(botToken || `xoxb-${forTenant.slug}`),
    installedByUserId: installedBy._id,
    status: 'connected',
    connectedAt: new Date(),
    defaultChannelId: 'C_DEFAULT',
    defaultChannelName: 'employee-gifting',
    notifications: {
      walletApproved: true,
      budgetAssigned: true,
      lowBudget: true,
      pointsDistributed: true,
      kitsAssigned: true,
      orderDispatched: true,
      deliveryFailed: true,
      shopLaunched: true,
    },
    ...rest,
  });
}

beforeAll(async () => {
  await connectTestDb();
  app = createApp();
  vi.spyOn(envModule, 'slackConfigured').mockReturnValue(true);
  envModule.env.SLACK_CLIENT_ID = 'slack-client-id';
  envModule.env.SLACK_CLIENT_SECRET = 'slack-client-secret';
  envModule.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  envModule.env.APP_URL = 'https://shelfmerch.io';
});

afterAll(async () => {
  vi.restoreAllMocks();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  tenantA = await Tenant.create({ name: 'Amazon', slug: 'amazon-slack-v1' });
  tenantB = await Tenant.create({ name: 'BetaCo', slug: 'beta-slack-v1' });
  ({ user: adminA, token: adminToken } = await makeUser('company_admin', 'tenant'));
  ({ token: managerToken } = await makeUser('entity_manager', 'entity'));
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('Slack preferences API', () => {
  it('company admin can update preferences', async () => {
    await seedSlack(tenantA, adminA);
    fetchMock.mockResolvedValue(mockJson({ ok: true }));
    const res = await request(app)
      .put('/api/integrations/slack/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderDispatched: false, walletApproved: true });
    expect(res.status).toBe(200);
    expect(res.body.connection.notifications.orderDispatched).toBe(false);
    expect(res.body.connection.notifications.walletApproved).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('xoxb');
  });

  it('entity admin cannot change Slack settings', async () => {
    await seedSlack(tenantA, adminA);
    const res = await request(app)
      .put('/api/integrations/slack/notifications')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ orderDispatched: false });
    expect(res.status).toBe(403);
  });

  it('rejects unknown preference keys', async () => {
    await seedSlack(tenantA, adminA);
    const res = await request(app)
      .put('/api/integrations/slack/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ unknownThing: true });
    expect(res.status).toBe(400);
  });
});

describe('Business notifications', () => {
  it('wallet approved sends once; duplicate eventKey does not resend', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-amazon' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '1.1' }));
    const job = {
      tenantId: tenantA._id,
      type: SLACK_EVENT_TYPES.WALLET_APPROVED,
      eventKey: 'WALLET_APPROVED:txn1',
      resourceType: 'WalletTransaction',
      resourceId: 'txn1',
      payload: { amount: 1000000, newBalance: 1450000, companyName: 'Amazon', poNumber: 'PO-2026-1042' },
    };
    scheduleSlackBusinessNotification(job);
    await flushPendingSlackNotifications();
    scheduleSlackBusinessNotification(job);
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('PO-2026-1042');
    expect(body.text).not.toContain('fileUrl');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer xoxb-amazon');
  });

  it('disabled preference prevents notification', async () => {
    await seedSlack(tenantA, adminA, {
      notifications: {
        walletApproved: false,
        budgetAssigned: true,
        lowBudget: true,
        pointsDistributed: true,
        kitsAssigned: true,
        orderDispatched: true,
        deliveryFailed: true,
        shopLaunched: true,
      },
    });
    const result = await deliverSlackBusinessNotification({
      tenantId: tenantA._id,
      type: SLACK_EVENT_TYPES.WALLET_APPROVED,
      eventKey: 'WALLET_APPROVED:disabled',
      payload: { amount: 100, newBalance: 100, companyName: 'Amazon' },
    });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('preference_disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('budget assigned includes entity and amount', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-amazon' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '2.2' }));
    await deliverSlackBusinessNotification({
      tenantId: tenantA._id,
      type: SLACK_EVENT_TYPES.BUDGET_ASSIGNED,
      eventKey: 'BUDGET_ASSIGNED:a1',
      actorUserId: adminA._id,
      payload: { amount: 200000, entityName: 'Marketing', availableBudget: 200000 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('Marketing');
    expect(body.text).toMatch(/2,00,000|200,000/);
  });

  it('low budget triggers once on threshold cross, not while remaining low, resets on top-up', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-amazon' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '3.3' }));
    const wallet = await Wallet.create({
      tenantId: tenantA._id,
      name: 'Main',
      ownerUserId: adminA._id,
      balance: 100000,
      allocatedAmount: 100000,
      totalAmount: 100000,
      status: 'active',
    });
    const entity = await Entity.create({
      tenantId: tenantA._id,
      walletId: wallet._id,
      name: 'Marketing',
      allocatedAmount: 100000,
      spentAmount: 82000, // 18% remaining
      lowBudgetAlertActive: false,
      lowBudgetAlertCycle: 0,
    });

    await evaluateEntityLowBudgetAlert({ tenantId: tenantA._id, entityId: entity._id });
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still low — no second alert
    entity.spentAmount = 90000;
    await entity.save();
    await evaluateEntityLowBudgetAlert({ tenantId: tenantA._id, entityId: entity._id });
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Top up above threshold — reset
    const refreshed = await Entity.findOne({ _id: entity._id, tenantId: tenantA._id });
    refreshed.spentAmount = 10000;
    await refreshed.save();
    await evaluateEntityLowBudgetAlert({ tenantId: tenantA._id, entityId: entity._id });
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await Entity.findOne({ _id: entity._id, tenantId: tenantA._id })).lowBudgetAlertActive).toBe(false);

    // Cross again
    const again = await Entity.findOne({ _id: entity._id, tenantId: tenantA._id });
    again.spentAmount = 85000;
    await again.save();
    await evaluateEntityLowBudgetAlert({ tenantId: tenantA._id, entityId: entity._id });
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('points distributed sends one message with actor and count, no employee list', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-amazon' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '4.4' }));
    await deliverSlackBusinessNotification({
      tenantId: tenantA._id,
      type: SLACK_EVENT_TYPES.POINTS_DISTRIBUTED,
      eventKey: 'POINTS_DISTRIBUTED:c1',
      actorUserId: adminA._id,
      payload: {
        entityName: 'Marketing',
        recipientCount: 100,
        totalPoints: 50000,
        remainingBudget: 325000,
      },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('100');
    expect(body.text).toContain('50,000');
    expect(body.text).not.toContain('@');
    expect(body.text).toContain('company_admin user');
  });

  it('kits assigned summarizes recipients as count', async () => {
    await seedSlack(tenantA, adminA);
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '5.5' }));
    await deliverSlackBusinessNotification({
      tenantId: tenantA._id,
      type: SLACK_EVENT_TYPES.KITS_ASSIGNED,
      eventKey: 'KITS_ASSIGNED:c2',
      payload: { entityName: 'HR', kitName: 'New Hire Welcome Kit', recipientCount: 75 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('75');
    expect(body.text).toContain('New Hire Welcome Kit');
  });

  it('order dispatched still works via receipts', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-amazon' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '6.6' }));
    const order = await Order.create({
      tenantId: tenantA._id,
      campaignId: tenantA._id,
      recipientId: tenantA._id,
      orderNumber: 'SM-V1-1',
      items: [{ name: 'Mug', qty: 1, unitPriceInr: 100, costPriceInr: 40 }],
      shippingAddress: { name: 'Anjali Raj', line1: 'x', city: 'BLR', state: 'KA', pincode: '560001' },
      amountBreakdown: { subtotal: 100, serviceFee: 0, gst: 18, total: 118 },
      status: 'shipped',
    });
    const first = await notifyOrderDispatched({ orderId: order._id, tenantId: tenantA._id });
    const second = await notifyOrderDispatched({ orderId: order._id, tenantId: tenantA._id });
    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const receipt = await SlackNotificationReceipt.findOne({
      tenantId: tenantA._id,
      eventKey: `ORDER_DISPATCHED:${order._id}`,
    });
    expect(receipt.status).toBe('sent');
  });

  it('delivery failure notifies once per status; unrelated status does not', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-amazon' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '7.7' }));
    const order = await Order.create({
      tenantId: tenantA._id,
      campaignId: tenantA._id,
      recipientId: tenantA._id,
      orderNumber: 'SM-V1-2',
      items: [{ name: 'Kit', qty: 1, unitPriceInr: 100, costPriceInr: 40 }],
      shippingAddress: { name: 'Anjali Raj', line1: 'secret street', city: 'BLR', state: 'KA', pincode: '560001' },
      amountBreakdown: { subtotal: 100, serviceFee: 0, gst: 18, total: 118 },
      status: 'shipped',
    });
    const shipment = await Shipment.create({
      tenantId: tenantA._id,
      orderId: order._id,
      status: 'shipped',
      courier: 'Delhivery',
      awb: 'AWB1',
    });
    await addShipmentEvent({
      shipmentId: shipment._id,
      status: 'rto',
      note: 'Address incomplete',
      actor: { userId: adminA._id },
    });
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('SM-V1-2');
    expect(body.text).toContain('Address incomplete');
    expect(body.text).not.toContain('secret street');

    // Same failure again (already rto) — no transition, no duplicate
    await addShipmentEvent({
      shipmentId: shipment._id,
      status: 'rto',
      note: 'Address incomplete',
      actor: { userId: adminA._id },
    });
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('draft shop does not notify; publish sends once', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-amazon' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '8.8' }));
    const shop = await Shop.create({
      tenantId: tenantA._id,
      name: 'Amazon Rewards Shop',
      status: 'draft',
      categories: ['Apparel'],
      activeListingKeys: ['c1:p1', 'c1:p2'],
    });
    // draft create already done — publish
    await publishShop({ tenantId: tenantA._id, shopId: shop._id, actorUserId: adminA._id });
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await publishShop({ tenantId: tenantA._id, shopId: shop._id, actorUserId: adminA._id });
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('Amazon Rewards Shop');
  });

  it('tenant A never uses tenant B Slack token', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-tenant-a' });
    const adminB = (await makeUser('company_admin', 'tenant', tenantB)).user;
    await seedSlack(tenantB, adminB, {
      botToken: 'xoxb-tenant-b',
      teamId: 'T_BETA',
      defaultChannelId: 'C_BETA',
    });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '9.9' }));
    await deliverSlackBusinessNotification({
      tenantId: tenantA._id,
      type: SLACK_EVENT_TYPES.SHOP_LAUNCHED,
      eventKey: 'SHOP_LAUNCHED:iso',
      payload: { shopName: 'A Shop', productCount: 1 },
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer xoxb-tenant-a');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).channel).toBe('C_DEFAULT');
  });

  it('Slack API failure marks receipt failed and does not throw to schedule path', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-amazon' });
    fetchMock.mockResolvedValue(mockJson({ ok: false, error: 'rate_limited' }));
    scheduleSlackBusinessNotification({
      tenantId: tenantA._id,
      type: SLACK_EVENT_TYPES.WALLET_APPROVED,
      eventKey: 'WALLET_APPROVED:fail1',
      payload: { amount: 10, newBalance: 10, companyName: 'Amazon' },
    });
    await flushPendingSlackNotifications();
    const receipt = await SlackNotificationReceipt.findOne({
      tenantId: tenantA._id,
      eventKey: 'WALLET_APPROVED:fail1',
    });
    expect(receipt.status).toBe('failed');
    expect(receipt.lastErrorCode).toBeTruthy();
    const conn = await SlackConnection.findOne({ tenantId: tenantA._id });
    expect(conn.status).toBe('connected');
  });

  it('token revoked maps connection to needs_attention', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-secret' });
    fetchMock.mockResolvedValue(mockJson({ ok: false, error: 'token_revoked' }));
    await expect(
      deliverSlackBusinessNotification({
        tenantId: tenantA._id,
        type: SLACK_EVENT_TYPES.WALLET_APPROVED,
        eventKey: 'WALLET_APPROVED:revoked',
        payload: { amount: 10, newBalance: 10, companyName: 'Amazon' },
      }),
    ).rejects.toMatchObject({ code: 'SLACK_AUTH_FAILED' });
    const conn = await SlackConnection.findOne({ tenantId: tenantA._id });
    expect(conn.status).toBe('needs_attention');
  });
});

describe('approveFunding Slack side-effect', () => {
  it('PO pending alone does not credit; approveFunding sends wallet Slack', async () => {
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-amazon' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '10.10' }));
    const wallet = await Wallet.create({
      tenantId: tenantA._id,
      name: 'Amazon Wallet',
      ownerUserId: adminA._id,
      balance: 0,
      allocatedAmount: 0,
      totalAmount: 0,
      status: 'wallet_created',
      fundingMethod: 'po_upload',
      fundingDocument: {
        docType: 'PO',
        docNumber: 'PO-1042',
        approvalStatus: 'pending',
        requestedAmount: 50000,
        plannedAllocations: [],
      },
    });
    // pending upload state — no Slack yet
    expect(fetchMock).not.toHaveBeenCalled();

    await approveFunding({ walletId: wallet._id, amount: 50000, performedBy: adminA._id });
    await flushPendingSlackNotifications();
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain(SLACK_CHAT_POST_MESSAGE_URL);
    const refreshed = await Wallet.findById(wallet._id).setOptions({ skipTenantGuard: true });
    expect(refreshed.balance).toBeGreaterThanOrEqual(50000);
    expect(refreshed.fundingDocument.approvalStatus).toBe('approved');
  });
});