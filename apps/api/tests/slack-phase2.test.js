import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup.js';
import { createApp } from '../src/app.js';
import { Tenant } from '../src/modules/tenants/tenant.model.js';
import { User } from '../src/modules/users/user.model.js';
import { RoleAssignment } from '../src/modules/roles/roleAssignment.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Shipment } from '../src/modules/shipments/shipment.model.js';
import { encryptToken } from '../src/utils/tokenEncryption.js';
import { SlackConnection } from '../src/modules/integrations/slack/slackConnection.model.js';
import { SlackNotificationReceipt } from '../src/modules/integrations/slack/slackNotificationReceipt.model.js';
import {
  notifyOrderDispatched,
  scheduleOrderDispatchedSlackNotification,
  buildOrderDispatchedSlackMessageForTest,
  flushPendingSlackNotifications,
} from '../src/modules/integrations/slack/slackNotify.service.js';
import { updatePlatformOrderStatus } from '../src/modules/platform/platform.service.js';
import { addShipmentEvent } from '../src/modules/shipments/shipments.service.js';
import * as envModule from '../src/config/env.js';
import { SLACK_CHAT_POST_MESSAGE_URL } from '../src/modules/integrations/slack/slack.constants.js';

let tenantA;
let tenantB;
let adminA;
let fetchMock;

function mockJson(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

async function flushSlackSideEffects() {
  await flushPendingSlackNotifications();
}

async function makeOrder(forTenant, overrides = {}) {
  return Order.create({
    tenantId: forTenant._id,
    campaignId: forTenant._id,
    recipientId: forTenant._id,
    orderNumber: `SM-${Math.floor(Math.random() * 9000) + 1000}`,
    items: [{ name: 'Welcome Kit', qty: 1, unitPriceInr: 500, costPriceInr: 200, gstRate: 18 }],
    shippingAddress: {
      name: 'Anjali Raj',
      line1: '12 MG Road',
      city: 'Bengaluru',
      state: 'KA',
      pincode: '560001',
    },
    amountBreakdown: { subtotal: 500, serviceFee: 0, gst: 90, total: 590 },
    status: 'packed',
    ...overrides,
  }).then((o) => o);
}

async function seedSlack(forTenant, installedBy, overrides = {}) {
  return SlackConnection.create({
    tenantId: forTenant._id,
    teamId: `T_${String(forTenant._id).slice(-6)}`,
    teamName: `${forTenant.name} Slack`,
    encryptedBotToken: encryptToken(overrides.botToken || `xoxb-${forTenant.slug}`),
    installedByUserId: installedBy._id,
    status: 'connected',
    connectedAt: new Date(),
    defaultChannelId: 'C_DEFAULT',
    defaultChannelName: 'all-shelfmerch-swag',
    notifyOrderDispatched: true,
    ...overrides,
    botToken: undefined,
  });
}

beforeAll(async () => {
  await connectTestDb();
  createApp();
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
  tenantA = await Tenant.create({ name: 'Acme', slug: 'acme-slack-p2' });
  tenantB = await Tenant.create({ name: 'Beta', slug: 'beta-slack-p2' });
  adminA = await User.create({
    tenantId: tenantA._id,
    name: 'Admin A',
    email: `admin-a-${Date.now()}@test.io`,
    status: 'active',
  });
  await RoleAssignment.create({
    tenantId: tenantA._id,
    userId: adminA._id,
    role: 'company_admin',
    scopeType: 'tenant',
  });
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchMock?.mockRestore();
});

describe('Slack message builder (safe content)', () => {
  it('includes safe order details and APP_URL link', () => {
    const { text, blocks } = buildOrderDispatchedSlackMessageForTest(
      {
        orderNumber: 'SM-1024',
        _id: '507f1f77bcf86cd799439011',
        shippingAddress: { name: 'Anjali Raj' },
        items: [{ name: 'Welcome Kit', qty: 1 }],
        trackingNumber: '',
      },
      { courier: 'Delhivery', awb: 'ABC123456' },
    );
    expect(text).toContain('SM-1024');
    expect(text).toContain('Anjali Raj');
    expect(text).toContain('Welcome Kit');
    expect(text).toContain('Delhivery');
    expect(text).toContain('ABC123456');
    expect(text).toContain('https://shelfmerch.io/app/orders');
    expect(text).not.toContain('costPrice');
    expect(text).not.toContain('xoxb');
    expect(JSON.stringify(blocks)).toContain('Order dispatched');
  });

  it('omits missing optional fields cleanly', () => {
    const { text } = buildOrderDispatchedSlackMessageForTest(
      {
        orderNumber: 'SM-1',
        items: [],
        shippingAddress: {},
      },
      null,
    );
    expect(text).toContain('SM-1');
    expect(text).toContain('Status: Dispatched');
    expect(text).not.toContain('Recipient:');
    expect(text).not.toContain('Courier:');
    expect(text).not.toContain('Tracking:');
  });
});

describe('notifyOrderDispatched', () => {
  it('sends Slack once for packed -> shipped transition claim', async () => {
    const order = await makeOrder(tenantA, { status: 'shipped' });
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-acme' });
    fetchMock.mockResolvedValueOnce(mockJson({ ok: true, ts: '1.1' }));

    const first = await notifyOrderDispatched({ orderId: order._id, tenantId: tenantA._id });
    const second = await notifyOrderDispatched({ orderId: order._id, tenantId: tenantA._id });

    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(second.reason).toBe('already_notified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(SLACK_CHAT_POST_MESSAGE_URL);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer xoxb-acme');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.channel).toBe('C_DEFAULT');
    expect(body.text).toContain(order.orderNumber);
    expect(JSON.stringify(body)).not.toContain('xoxb');
  });

  it('skips when no Slack connection and does not claim', async () => {
    const order = await makeOrder(tenantA, { status: 'shipped' });
    const result = await notifyOrderDispatched({ orderId: order._id, tenantId: tenantA._id });
    expect(result).toEqual({ sent: false, reason: 'no_connection' });
    const refreshed = await Order.findById(order._id).setOptions({ skipTenantGuard: true });
    expect(refreshed.slackDispatchNotifiedAt).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when connected but no default channel', async () => {
    const order = await makeOrder(tenantA, { status: 'shipped' });
    await seedSlack(tenantA, adminA, { defaultChannelId: '', defaultChannelName: '' });
    const result = await notifyOrderDispatched({ orderId: order._id, tenantId: tenantA._id });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('no_connection');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses tenant A token only; never tenant B', async () => {
    const orderA = await makeOrder(tenantA, { status: 'shipped' });
    const adminB = await User.create({
      tenantId: tenantB._id,
      name: 'Admin B',
      email: `admin-b-${Date.now()}@test.io`,
      status: 'active',
    });
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-tenant-a' });
    await seedSlack(tenantB, adminB, {
      botToken: 'xoxb-tenant-b',
      teamId: 'T_BETA',
      defaultChannelId: 'C_BETA',
    });
    fetchMock.mockResolvedValueOnce(mockJson({ ok: true, ts: '2.2' }));

    await notifyOrderDispatched({ orderId: orderA._id, tenantId: tenantA._id });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer xoxb-tenant-a');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).not.toContain('tenant-b');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.channel).toBe('C_DEFAULT');
  });

  it('maps token revoked to needs_attention without leaking token', async () => {
    const order = await makeOrder(tenantA, { status: 'shipped' });
    const conn = await seedSlack(tenantA, adminA, { botToken: 'xoxb-secret-token' });
    fetchMock.mockResolvedValueOnce(mockJson({ ok: false, error: 'token_revoked' }));

    await expect(
      notifyOrderDispatched({ orderId: order._id, tenantId: tenantA._id }),
    ).rejects.toMatchObject({ code: 'SLACK_AUTH_FAILED' });

    const refreshed = await SlackConnection.findById(conn._id).setOptions({ skipTenantGuard: true });
    expect(refreshed.status).toBe('needs_attention');
    const receipt = await SlackNotificationReceipt.findOne({
      tenantId: tenantA._id,
      eventKey: `ORDER_DISPATCHED:${order._id}`,
    }).setOptions({ skipTenantGuard: true });
    expect(receipt.status).toBe('failed');
  });
});

describe('dispatch path wiring (non-blocking)', () => {
  it('packed -> shipped via platform status sends Slack once', async () => {
    const order = await makeOrder(tenantA, { status: 'packed' });
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-acme' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '3.3' }));

    await updatePlatformOrderStatus({
      orderId: order._id,
      status: 'shipped',
      note: 'Dispatched',
      actor: { userId: adminA._id },
    });
    await flushSlackSideEffects();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const refreshed = await Order.findById(order._id).setOptions({ skipTenantGuard: true });
    expect(refreshed.status).toBe('shipped');
    expect(refreshed.slackDispatchNotifiedAt).toBeTruthy();
  });

  it('packed -> shipped via shipment event sends Slack once', async () => {
    const order = await makeOrder(tenantA, { status: 'packed' });
    const shipment = await Shipment.create({
      tenantId: tenantA._id,
      orderId: order._id,
      status: 'packed',
      courier: 'Delhivery',
      awb: 'AWB999',
    });
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-acme' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '4.4' }));

    await addShipmentEvent({
      shipmentId: shipment._id,
      status: 'shipped',
      note: 'Out',
      actor: { userId: adminA._id },
    });
    await flushSlackSideEffects();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('AWB999');
    expect(body.text).toContain('Delhivery');
  });

  it('shipped -> shipped does not send again', async () => {
    const order = await makeOrder(tenantA, { status: 'shipped', slackDispatchNotifiedAt: new Date() });
    await seedSlack(tenantA, adminA);
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '5.5' }));

    scheduleOrderDispatchedSlackNotification(order, false);
    await flushSlackSideEffects();
    expect(fetchMock).not.toHaveBeenCalled();

    // Same-status platform update cannot re-enter shipped from shipped via machine for shipped->shipped;
    // simulate a no-op schedule after already shipped.
    const again = await notifyOrderDispatched({ orderId: order._id, tenantId: tenantA._id });
    expect(again.sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unrelated status change sends nothing', async () => {
    const order = await makeOrder(tenantA, { status: 'packed' });
    await seedSlack(tenantA, adminA);
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '6.6' }));

    await updatePlatformOrderStatus({
      orderId: order._id,
      status: 'issue_raised',
      note: 'Problem',
      actor: { userId: adminA._id },
    });
    await flushSlackSideEffects();

    expect(fetchMock).not.toHaveBeenCalled();
    const refreshed = await Order.findById(order._id).setOptions({ skipTenantGuard: true });
    expect(refreshed.status).toBe('issue_raised');
    expect(refreshed.slackDispatchNotifiedAt).toBeNull();
  });

  it('no Slack connection — order still succeeds', async () => {
    const order = await makeOrder(tenantA, { status: 'packed' });
    const updated = await updatePlatformOrderStatus({
      orderId: order._id,
      status: 'shipped',
      actor: { userId: adminA._id },
    });
    await flushSlackSideEffects();
    expect(updated.status).toBe('shipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no default channel — order still succeeds', async () => {
    const order = await makeOrder(tenantA, { status: 'packed' });
    await seedSlack(tenantA, adminA, { defaultChannelId: '', defaultChannelName: '' });
    const updated = await updatePlatformOrderStatus({
      orderId: order._id,
      status: 'shipped',
      actor: { userId: adminA._id },
    });
    await flushSlackSideEffects();
    expect(updated.status).toBe('shipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Slack API failure — order remains shipped', async () => {
    const order = await makeOrder(tenantA, { status: 'packed' });
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-acme' });
    fetchMock.mockResolvedValue(mockJson({ ok: false, error: 'rate_limited' }));

    const updated = await updatePlatformOrderStatus({
      orderId: order._id,
      status: 'shipped',
      actor: { userId: adminA._id },
    });
    await flushSlackSideEffects();

    expect(updated.status).toBe('shipped');
    const refreshed = await Order.findById(order._id).setOptions({ skipTenantGuard: true });
    expect(refreshed.status).toBe('shipped');
    const receipt = await SlackNotificationReceipt.findOne({
      tenantId: tenantA._id,
      eventKey: `ORDER_DISPATCHED:${order._id}`,
    }).setOptions({ skipTenantGuard: true });
    expect(receipt.status).toBe('failed');
    const conn = await SlackConnection.findOne({ tenantId: tenantA._id }).setOptions({
      skipTenantGuard: true,
    });
    expect(conn.status).toBe('connected');
  });

  it('duplicate dispatch update does not duplicate notification', async () => {
    const order = await makeOrder(tenantA, { status: 'packed' });
    await seedSlack(tenantA, adminA, { botToken: 'xoxb-acme' });
    fetchMock.mockResolvedValue(mockJson({ ok: true, ts: '7.7' }));

    await updatePlatformOrderStatus({
      orderId: order._id,
      status: 'shipped',
      actor: { userId: adminA._id },
    });
    await flushSlackSideEffects();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Re-save / re-notify path
    const refreshed = await Order.findById(order._id).setOptions({ skipTenantGuard: true });
    scheduleOrderDispatchedSlackNotification(refreshed, true);
    await flushSlackSideEffects();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});