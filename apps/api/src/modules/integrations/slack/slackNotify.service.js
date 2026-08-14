import { logger } from '../../../config/logger.js';
import { slackConfigured } from '../../../config/env.js';
import { ApiError } from '../../../utils/errors.js';
import { Order } from '../../orders/order.model.js';
import { Shipment } from '../../shipments/shipment.model.js';
import { SHIPMENT_EXCEPTION_STATUSES } from '../../shipments/shipment.model.js';
import { Entity } from '../../entities/entity.model.js';
import { User } from '../../users/user.model.js';
import { getSetting } from '../../platform/platformSettings.service.js';
import { SlackConnection } from './slackConnection.model.js';
import { SlackNotificationReceipt } from './slackNotificationReceipt.model.js';
import { postSlackChannelMessage } from './slack.service.js';
import {
  SLACK_EVENT_TYPES,
  SLACK_EVENT_TO_PREFERENCE,
  SLACK_EVENT_ORDER_DISPATCHED,
  DEFAULT_SLACK_NOTIFICATIONS,
} from './slack.events.js';
import { buildSlackBusinessMessage, formatInr, deliveryFailureLabel } from './slackMessages.js';

export { SLACK_EVENT_ORDER_DISPATCHED, SLACK_EVENT_TYPES };

/** @type {Promise<unknown>[]} */
const pendingSlackNotifications = [];

/** Await fire-and-forget Slack notify work (tests). */
export async function flushPendingSlackNotifications() {
  while (pendingSlackNotifications.length) {
    const batch = pendingSlackNotifications.splice(0, pendingSlackNotifications.length);
    await Promise.allSettled(batch);
  }
}

function formatItemsLine(items = []) {
  const parts = [];
  for (const item of items) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const qty = Number(item.qty);
    parts.push(Number.isFinite(qty) && qty > 1 ? `${name} x${qty}` : name);
  }
  return parts.join(', ');
}

export function resolveNotificationPreferences(connection) {
  const prefs = { ...DEFAULT_SLACK_NOTIFICATIONS };
  const nested = connection?.notifications;
  if (nested && typeof nested === 'object') {
    for (const key of Object.keys(DEFAULT_SLACK_NOTIFICATIONS)) {
      if (typeof nested[key] === 'boolean') prefs[key] = nested[key];
    }
  }
  // Legacy Phase 2 field
  if (
    connection &&
    Object.prototype.hasOwnProperty.call(connection, 'notifyOrderDispatched') &&
    typeof connection.notifyOrderDispatched === 'boolean' &&
    (nested?.orderDispatched === undefined || nested?.orderDispatched === null)
  ) {
    prefs.orderDispatched = connection.notifyOrderDispatched !== false;
  }
  return prefs;
}

function isPreferenceEnabled(connection, eventType) {
  const prefKey = SLACK_EVENT_TO_PREFERENCE[eventType];
  if (!prefKey) return false;
  return resolveNotificationPreferences(connection)[prefKey] !== false;
}

async function resolveActorName(actorUserId) {
  if (!actorUserId) return null;
  const user = await User.findById(actorUserId)
    .select('name')
    .setOptions({ skipTenantGuard: true })
    .lean();
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  return name || null;
}

/**
 * Schedule a Slack business notification after a successful domain commit.
 * Never throws to callers — fire-and-forget.
 */
export function scheduleSlackBusinessNotification(job) {
  if (!job?.tenantId || !job?.type || !job?.eventKey) return;

  const run = () =>
    deliverSlackBusinessNotification(job).catch((err) => {
      logger.warn(
        {
          event: 'slack_notification',
          tenantId: String(job.tenantId),
          eventType: job.type,
          resourceId: job.resourceId ? String(job.resourceId) : undefined,
          status: 'failed',
          errorCode: err instanceof ApiError ? err.code : undefined,
          errMessage: err instanceof Error ? err.message : 'unknown',
        },
        'Slack business notification failed',
      );
    });

  if (process.env.NODE_ENV === 'test') {
    pendingSlackNotifications.push(Promise.resolve().then(run));
    return;
  }
  setImmediate(run);
}

/** Phase 2 compatible wrapper. */
export function scheduleOrderDispatchedSlackNotification(order, becameShipped) {
  if (!becameShipped || !order?._id || !order?.tenantId) return;
  scheduleSlackBusinessNotification({
    tenantId: order.tenantId,
    type: SLACK_EVENT_TYPES.ORDER_DISPATCHED,
    eventKey: `ORDER_DISPATCHED:${order._id}`,
    resourceType: 'Order',
    resourceId: order._id,
    payload: { orderId: order._id },
  });
}

async function findConnectedSlack(tenantId) {
  return SlackConnection.findOne({
    tenantId,
    status: 'connected',
    encryptedBotToken: { $ne: '' },
    defaultChannelId: { $ne: '' },
  })
    .sort({ updatedAt: -1 })
    .setOptions({ skipTenantGuard: true });
}

/**
 * Atomically claim a receipt. Returns null if already claimed/sent/failed.
 * Failed receipts are not auto-retried in v1.
 */
async function claimReceipt({ tenantId, eventType, eventKey, resourceType, resourceId, connectionId }) {
  try {
    const receipt = await SlackNotificationReceipt.create({
      tenantId,
      eventType,
      eventKey,
      resourceType: resourceType || '',
      resourceId: resourceId ? String(resourceId) : '',
      connectionId: connectionId || null,
      status: 'pending',
    });
    return receipt;
  } catch (err) {
    if (err?.code === 11000) return null;
    throw err;
  }
}

async function markReceiptSent(receipt) {
  receipt.status = 'sent';
  receipt.sentAt = new Date();
  receipt.failedAt = null;
  receipt.lastErrorCode = '';
  await receipt.save();
}

async function markReceiptFailed(receipt, err) {
  receipt.status = 'failed';
  receipt.failedAt = new Date();
  receipt.lastErrorCode = err instanceof ApiError ? err.code : 'SLACK_NOTIFY_FAILED';
  await receipt.save();
}

async function buildMessageForEvent(job) {
  const { type, payload = {} } = job;

  if (type === SLACK_EVENT_TYPES.WALLET_APPROVED) {
    const amount = formatInr(payload.amount);
    const balance = formatInr(payload.newBalance);
    const company = payload.companyName || 'company';
    const po = payload.poNumber ? String(payload.poNumber).trim() : '';
    return buildSlackBusinessMessage({
      emojiTitle: '💰 Wallet funded',
      headline: amount
        ? `${amount} has been approved and added to the ${company} company wallet.`
        : `Funds have been approved and added to the ${company} company wallet.`,
      fields: [
        { label: 'PO', value: po || null },
        { label: 'New wallet balance', value: balance },
        { label: 'Approved by', value: 'ShelfMerch' },
      ],
      linkPath: '/app/wallets',
    });
  }

  if (type === SLACK_EVENT_TYPES.BUDGET_ASSIGNED) {
    const amount = formatInr(payload.amount);
    const entityName = payload.entityName || 'team';
    const available = formatInr(payload.availableBudget);
    return buildSlackBusinessMessage({
      emojiTitle: '💳 Budget assigned',
      headline: amount ? `${amount} assigned to ${entityName}.` : `Budget assigned to ${entityName}.`,
      fields: [
        { label: 'Assigned by', value: payload.actorName || null },
        { label: 'Entity', value: entityName },
        { label: 'Available entity budget', value: available },
      ],
      linkPath: '/app/wallets',
    });
  }

  if (type === SLACK_EVENT_TYPES.LOW_BUDGET) {
    const remaining = formatInr(payload.remaining);
    const allocated = formatInr(payload.allocated);
    const pct =
      Number.isFinite(payload.remainingPct) ? `${Number(payload.remainingPct).toFixed(2)}%` : null;
    const entityName = payload.entityName || 'Entity';
    return buildSlackBusinessMessage({
      emojiTitle: '⚠️ Low budget alert',
      headline: `${entityName} budget is running low.`,
      fields: [
        { label: 'Remaining', value: remaining },
        { label: 'Allocated', value: allocated },
        { label: 'Remaining %', value: pct },
      ],
      linkPath: '/app/wallets',
    });
  }

  if (type === SLACK_EVENT_TYPES.POINTS_DISTRIBUTED) {
    const points = Number.isFinite(payload.totalPoints)
      ? Math.round(payload.totalPoints).toLocaleString('en-IN')
      : null;
    const recipients = Number.isFinite(payload.recipientCount)
      ? String(payload.recipientCount)
      : null;
    const entityName = payload.entityName || 'Team';
    const actor = payload.actorName || entityName;
    const headline =
      points && recipients
        ? `${actor} distributed ${points} points to ${recipients} employees.`
        : `${actor} distributed points to employees.`;
    return buildSlackBusinessMessage({
      emojiTitle: '🎁 Points distributed',
      headline,
      fields: [
        { label: 'Entity', value: entityName },
        { label: 'Recipients', value: recipients },
        { label: 'Total points', value: points },
        { label: 'Remaining budget', value: formatInr(payload.remainingBudget) },
      ],
      linkPath: '/app/campaigns/send-points',
    });
  }

  if (type === SLACK_EVENT_TYPES.KITS_ASSIGNED) {
    const recipients = Number.isFinite(payload.recipientCount)
      ? String(payload.recipientCount)
      : null;
    const kitName = payload.kitName || 'Kit';
    const entityName = payload.entityName || null;
    const countLabel = recipients || 'employees';
    return buildSlackBusinessMessage({
      emojiTitle: '📦 Kits assigned',
      headline: recipients
        ? `${recipients} ${kitName} kits were assigned to employees.`
        : `${kitName} kits were assigned to employees.`,
      fields: [
        { label: 'Entity', value: entityName },
        { label: 'Kit', value: kitName },
        { label: 'Recipients', value: recipients },
        { label: 'Created by', value: payload.actorName || null },
      ],
      linkPath: '/app/kits',
    });
  }

  if (type === SLACK_EVENT_TYPES.ORDER_DISPATCHED) {
    const order = payload.order;
    const shipment = payload.shipment;
    const orderNumber = order?.orderNumber || String(order?._id || '');
    const recipient = order?.shippingAddress?.name?.trim() || '';
    const items = formatItemsLine(order?.items || []);
    const courier = shipment?.courier?.trim() || '';
    const tracking = (shipment?.awb || order?.trackingNumber || '').trim();
    return buildSlackBusinessMessage({
      emojiTitle: '🎁 Order dispatched',
      headline: `Order *#${orderNumber}* has been dispatched.`,
      fields: [
        { label: 'Recipient', value: recipient || null },
        { label: 'Items', value: items || null },
        { label: 'Courier', value: courier || null },
        { label: 'Tracking', value: tracking || null },
        { label: 'Status', value: 'Dispatched' },
      ],
      linkPath: '/app/orders',
    });
  }

  if (type === SLACK_EVENT_TYPES.DELIVERY_FAILED) {
    const orderNumber = payload.orderNumber || '';
    const issue = deliveryFailureLabel(payload.failureStatus, payload.note);
    return buildSlackBusinessMessage({
      emojiTitle: '🚨 Delivery needs attention',
      headline: orderNumber
        ? `Order *#${orderNumber}* could not be delivered.`
        : 'A shipment needs attention.',
      fields: [
        { label: 'Recipient', value: payload.recipientName || null },
        { label: 'Courier', value: payload.courier || null },
        { label: 'Issue', value: issue },
      ],
      linkPath: '/app/orders',
      linkLabel: 'Open ShelfMerch to review the order',
    });
  }

  if (type === SLACK_EVENT_TYPES.SHOP_LAUNCHED) {
    const shopName = payload.shopName || 'Employee shop';
    const products =
      Number.isFinite(payload.productCount) && payload.productCount > 0
        ? String(payload.productCount)
        : null;
    return buildSlackBusinessMessage({
      emojiTitle: '🛍️ Employee shop launched',
      headline: `*${shopName}* is now live.`,
      fields: [
        { label: 'Created by', value: payload.actorName || null },
        { label: 'Products available', value: products },
      ],
      linkPath: '/app/shops',
    });
  }

  return null;
}

async function enrichPayload(job) {
  const payload = { ...(job.payload || {}) };

  if (job.type === SLACK_EVENT_TYPES.ORDER_DISPATCHED) {
    const orderId = payload.orderId || job.resourceId;
    const order = await Order.findOne({ _id: orderId, tenantId: job.tenantId }).setOptions({
      skipTenantGuard: true,
    });
    if (!order) return null;
    const shipment = await Shipment.findOne({ orderId: order._id, tenantId: job.tenantId })
      .select('courier awb trackingUrl')
      .setOptions({ skipTenantGuard: true })
      .lean();
    payload.order = order;
    payload.shipment = shipment;
  }

  if (job.actorUserId && !payload.actorName) {
    payload.actorName = await resolveActorName(job.actorUserId);
  }

  return payload;
}

export async function deliverSlackBusinessNotification(job) {
  if (!slackConfigured()) {
    return { sent: false, reason: 'not_configured' };
  }

  const tenantId = job.tenantId;
  const eventType = job.type;
  const eventKey = job.eventKey;

  const connection = await findConnectedSlack(tenantId);
  if (!connection) {
    logger.info(
      {
        event: 'slack_notification',
        tenantId: String(tenantId),
        eventType,
        status: 'skipped',
        errorCode: 'no_connection',
      },
      'Slack notification skipped — no connected workspace with default channel',
    );
    return { sent: false, reason: 'no_connection' };
  }

  if (!isPreferenceEnabled(connection, eventType)) {
    return { sent: false, reason: 'preference_disabled' };
  }

  // Legacy Phase 2 dedupe field — treat as already notified.
  if (eventType === SLACK_EVENT_TYPES.ORDER_DISPATCHED) {
    const orderId = job.resourceId || job.payload?.orderId;
    if (orderId) {
      const existing = await Order.findOne({ _id: orderId, tenantId })
        .select('slackDispatchNotifiedAt')
        .setOptions({ skipTenantGuard: true })
        .lean();
      if (existing?.slackDispatchNotifiedAt) {
        return { sent: false, reason: 'already_notified' };
      }
    }
  }

  const receipt = await claimReceipt({
    tenantId,
    eventType,
    eventKey,
    resourceType: job.resourceType,
    resourceId: job.resourceId,
    connectionId: connection._id,
  });
  if (!receipt) {
    return { sent: false, reason: 'already_notified' };
  }

  const payload = await enrichPayload({ ...job, payload: job.payload });
  if (!payload) {
    await markReceiptFailed(receipt, new ApiError(404, 'Resource missing', 'NOT_FOUND'));
    return { sent: false, reason: 'resource_missing' };
  }

  const message = await buildMessageForEvent({ ...job, payload });
  if (!message) {
    await markReceiptFailed(receipt, new ApiError(500, 'Unknown event', 'SLACK_UNKNOWN_EVENT'));
    return { sent: false, reason: 'unknown_event' };
  }

  try {
    await postSlackChannelMessage(tenantId, {
      channelId: connection.defaultChannelId,
      text: message.text,
      blocks: message.blocks,
      connection,
    });
    await markReceiptSent(receipt);

    // Keep Phase 2 order field in sync for older readers.
    if (eventType === SLACK_EVENT_TYPES.ORDER_DISPATCHED && job.resourceId) {
      await Order.updateOne(
        { _id: job.resourceId, tenantId },
        { $set: { slackDispatchNotifiedAt: new Date() } },
      ).setOptions({ skipTenantGuard: true });
    }

    logger.info(
      {
        event: 'slack_notification',
        tenantId: String(tenantId),
        eventType,
        resourceId: job.resourceId ? String(job.resourceId) : undefined,
        connectionId: String(connection._id),
        status: 'sent',
      },
      'Slack business notification sent',
    );
    return { sent: true };
  } catch (err) {
    await markReceiptFailed(receipt, err);
    throw err;
  }
}

/** @deprecated Prefer deliverSlackBusinessNotification — kept for Phase 2 tests. */
export async function notifyOrderDispatched({ orderId, tenantId }) {
  return deliverSlackBusinessNotification({
    tenantId,
    type: SLACK_EVENT_TYPES.ORDER_DISPATCHED,
    eventKey: `ORDER_DISPATCHED:${orderId}`,
    resourceType: 'Order',
    resourceId: orderId,
    payload: { orderId },
  });
}

export function buildOrderDispatchedSlackMessageForTest(order, shipment) {
  return buildSlackBusinessMessage({
    emojiTitle: '🎁 Order dispatched',
    headline: `Order *#${order.orderNumber || order._id}* has been dispatched.`,
    fields: [
      { label: 'Recipient', value: order.shippingAddress?.name?.trim() || null },
      { label: 'Items', value: formatItemsLine(order.items || []) || null },
      { label: 'Courier', value: shipment?.courier?.trim() || null },
      { label: 'Tracking', value: (shipment?.awb || order.trackingNumber || '').trim() || null },
      { label: 'Status', value: 'Dispatched' },
    ],
    linkPath: '/app/orders',
  });
}

/**
 * Threshold-crossing low-budget alert for an entity.
 * Uses platform setting alerts.lowWalletPct (default 20).
 */
export async function evaluateEntityLowBudgetAlert({ tenantId, entityId }) {
  if (!tenantId || !entityId) return { sent: false, reason: 'missing' };

  const entity = await Entity.findOne({ _id: entityId, tenantId }).setOptions({
    skipTenantGuard: true,
  });
  if (!entity) return { sent: false, reason: 'entity_missing' };

  const allocated = Number(entity.allocatedAmount) || 0;
  const spent = Number(entity.spentAmount) || 0;
  const remaining = Math.max(0, allocated - spent);
  const remainingPct = allocated > 0 ? (remaining / allocated) * 100 : 100;

  let thresholdPct = 20;
  try {
    const setting = await getSetting('alerts.lowWalletPct');
    const n = Number(setting);
    if (Number.isFinite(n) && n > 0 && n < 100) thresholdPct = n;
  } catch {
    // keep default
  }

  const below = allocated > 0 && remainingPct < thresholdPct;
  const wasActive = Boolean(entity.lowBudgetAlertActive);

  if (!below && wasActive) {
    entity.lowBudgetAlertActive = false;
    await entity.save();
    return { sent: false, reason: 'reset' };
  }

  if (below && !wasActive) {
    entity.lowBudgetAlertCycle = (Number(entity.lowBudgetAlertCycle) || 0) + 1;
    entity.lowBudgetAlertActive = true;
    await entity.save();
    scheduleSlackBusinessNotification({
      tenantId,
      type: SLACK_EVENT_TYPES.LOW_BUDGET,
      eventKey: `LOW_BUDGET:${entity._id}:${entity.lowBudgetAlertCycle}`,
      resourceType: 'Entity',
      resourceId: entity._id,
      payload: {
        entityName: entity.name,
        remaining,
        allocated,
        remainingPct,
      },
    });
    return { scheduled: true };
  }

  return { sent: false, reason: below ? 'already_active' : 'above_threshold' };
}

export function isShipmentDeliveryFailureStatus(status) {
  return SHIPMENT_EXCEPTION_STATUSES.includes(status);
}

export async function scheduleDeliveryFailedIfNeeded({ shipment, priorStatus, note }) {
  if (!shipment?._id || !shipment?.tenantId) return;
  if (!isShipmentDeliveryFailureStatus(shipment.status)) return;
  if (priorStatus === shipment.status) return;

  const order = await Order.findOne({ _id: shipment.orderId, tenantId: shipment.tenantId })
    .select('orderNumber shippingAddress.name')
    .setOptions({ skipTenantGuard: true })
    .lean();

  scheduleSlackBusinessNotification({
    tenantId: shipment.tenantId,
    type: SLACK_EVENT_TYPES.DELIVERY_FAILED,
    eventKey: `DELIVERY_FAILED:${shipment._id}:${shipment.status}`,
    resourceType: 'Shipment',
    resourceId: shipment._id,
    payload: {
      orderNumber: order?.orderNumber || '',
      recipientName: order?.shippingAddress?.name || '',
      courier: shipment.courier || '',
      failureStatus: shipment.status,
      note: note || '',
    },
  });
}