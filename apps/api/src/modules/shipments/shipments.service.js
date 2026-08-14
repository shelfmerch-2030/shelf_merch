import { Shipment } from './shipment.model.js';
import { Order } from '../orders/order.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { transitionState, canTransition } from '../../services/stateMachine.service.js';
import { sendNotificationEmail } from '../../services/email.service.js';
import { ApiError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { scheduleOrderDispatchedSlackNotification, scheduleDeliveryFailedIfNeeded } from '../integrations/slack/slackNotify.service.js';

function buildFilter(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.tenantId) filter.tenantId = query.tenantId;
  if (query.orderId) filter.orderId = query.orderId;
  if (query.courier) filter.courier = { $regex: query.courier, $options: 'i' };
  if (query.awb) filter.awb = query.awb;
  return filter;
}

export async function listShipments({ query }) {
  const { page, limit, skip } = getPagination(query);
  const filter = buildFilter(query);

  const [items, total] = await Promise.all([
    Shipment.find(filter).setOptions({ skipTenantGuard: true }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Shipment.countDocuments(filter).setOptions({ skipTenantGuard: true }),
  ]);

  const orderIds = items.map((s) => s.orderId);
  const orders = await Order.find({ _id: { $in: orderIds } })
    .setOptions({ skipTenantGuard: true })
    .select('orderNumber status shippingAddress.name')
    .lean();
  const orderById = Object.fromEntries(orders.map((o) => [String(o._id), o]));

  const enriched = items.map((s) => ({
    ...s,
    orderNumber: orderById[String(s.orderId)]?.orderNumber ?? '',
    recipientName: orderById[String(s.orderId)]?.shippingAddress?.name ?? '',
  }));

  return paginatedResponse(enriched, total, { page, limit });
}

export async function getShipment(shipmentId) {
  const shipment = await Shipment.findById(shipmentId).setOptions({ skipTenantGuard: true });
  if (!shipment) throw new NotFoundError('Shipment not found');
  return shipment;
}

/** §3.7 Add AWB — creates the shipment for a packed order. */
export async function createShipment({ orderId, courier, awb, trackingUrl = '', eta = null, actor }) {
  const order = await Order.findById(orderId).setOptions({ skipTenantGuard: true });
  if (!order) throw new NotFoundError('Order not found');

  const existing = await Shipment.findOne({ orderId: order._id, tenantId: order.tenantId });
  if (existing) throw new ConflictError('A shipment already exists for this order');

  const shipment = await Shipment.create({
    tenantId: order.tenantId,
    orderId: order._id,
    courier,
    awb,
    trackingUrl,
    eta,
    status: 'pending',
    statusHistory: [{ status: 'pending', at: new Date(), actorUserId: actor?.userId ?? null, note: 'AWB added' }],
    events: [{ status: 'pending', note: `AWB ${awb} (${courier})`, at: new Date() }],
  });

  order.trackingNumber = awb;
  await order.save();

  return shipment;
}

/** §3.7 Bulk AWB — rows of { orderNumber, courier, awb }. Partial success allowed. */
export async function bulkAddAwb({ rows, actor }) {
  const results = [];
  for (const row of rows) {
    try {
      const order = await Order.findOne({ orderNumber: row.orderNumber }).setOptions({ skipTenantGuard: true });
      if (!order) throw new NotFoundError(`Order "${row.orderNumber}" not found`);
      const shipment = await createShipment({
        orderId: order._id,
        courier: row.courier,
        awb: row.awb,
        actor,
      });
      results.push({ orderNumber: row.orderNumber, ok: true, shipmentId: String(shipment._id) });
    } catch (err) {
      results.push({ orderNumber: row.orderNumber, ok: false, error: err.message });
    }
  }
  return {
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/** CSV text → rows. Expected header: orderNumber,courier,awb. */
export function parseBulkAwbCsv(csvText) {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new ApiError(422, 'CSV is empty', 'INVALID_CSV');

  const header = lines[0].split(',').map((h) => h.trim());
  const idx = {
    orderNumber: header.indexOf('orderNumber'),
    courier: header.indexOf('courier'),
    awb: header.indexOf('awb'),
  };
  if (Object.values(idx).some((i) => i === -1)) {
    throw new ApiError(422, 'CSV header must be: orderNumber,courier,awb', 'INVALID_CSV');
  }

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    return { orderNumber: cols[idx.orderNumber], courier: cols[idx.courier], awb: cols[idx.awb] };
  });
}

/**
 * §3.7 — order advancement always goes through the order machine, never a
 * direct `.status =`. `shipped` pushes packed→shipped; `delivered` walks the
 * chain to delivered.
 */
async function syncOrderWithShipment(shipment, status, actor) {
  const order = await Order.findOne({ _id: shipment.orderId, tenantId: shipment.tenantId }).setOptions({
    skipTenantGuard: true,
  });
  if (!order) return;

  const priorStatus = order.status;
  if (status === 'shipped' && canTransition('order', order.status, 'shipped')) {
    transitionState('order', order, 'shipped', actor, 'Shipment dispatched');
  }
  if (status === 'delivered') {
    if (order.status === 'packed' && canTransition('order', 'packed', 'shipped')) {
      transitionState('order', order, 'shipped', actor, 'Shipment delivered');
    }
    if (order.status === 'shipped' && canTransition('order', 'shipped', 'delivered')) {
      transitionState('order', order, 'delivered', actor, 'Shipment delivered');
    }
  }
  if (shipment.awb && !order.trackingNumber) order.trackingNumber = shipment.awb;
  await order.save();

  // Slack Phase 2: notify once when the order newly reaches (or passes through) shipped.
  const becameShipped =
    priorStatus !== 'shipped' &&
    (order.status === 'shipped' ||
      (priorStatus === 'packed' && order.status === 'delivered'));
  scheduleOrderDispatchedSlackNotification(order, becameShipped);
}

export async function addShipmentEvent({ shipmentId, status, location, note, at, actor }) {
  const shipment = await getShipment(shipmentId);
  const eventAt = at ?? new Date();
  const priorStatus = shipment.status;

  shipment.events.push({ status, location: location ?? '', note: note ?? '', at: eventAt });
  if (shipment.status !== status) {
    transitionState('shipment', shipment, status, actor, note ?? '');
  }
  if (status === 'delivered') shipment.deliveredAt = eventAt;

  await shipment.save();
  await syncOrderWithShipment(shipment, status, actor);
  await scheduleDeliveryFailedIfNeeded({ shipment, priorStatus, note });
  return shipment;
}

export async function updateShipment({ shipmentId, patch }) {
  const shipment = await getShipment(shipmentId);
  const allowed = ['courier', 'awb', 'trackingUrl', 'eta'];
  for (const key of allowed) {
    if (patch[key] !== undefined) shipment[key] = patch[key];
  }
  await shipment.save();
  return shipment;
}

/** §3.7 — resend the tracking link to the recipient on file. */
export async function resendTrackingLink({ shipmentId }) {
  const shipment = await getShipment(shipmentId);
  const order = await Order.findOne({ _id: shipment.orderId, tenantId: shipment.tenantId }).setOptions({
    skipTenantGuard: true,
  });
  if (!order) throw new NotFoundError('Order not found for this shipment');

  const recipient = await Recipient.findOne({ _id: order.recipientId, tenantId: order.tenantId }).setOptions({
    skipTenantGuard: true,
  });
  if (!recipient?.email) {
    throw new ApiError(422, 'No recipient email on file for this order', 'NO_RECIPIENT_EMAIL');
  }

  await sendNotificationEmail({
    to: recipient.email,
    title: `Tracking update for order ${order.orderNumber}`,
    body: `Your gift is on its way via ${shipment.courier || 'our courier'} (AWB ${shipment.awb}).`,
    link: shipment.trackingUrl || `/redeem/track/${order.orderNumber}`,
  });

  return { sent: true, to: recipient.email };
}
