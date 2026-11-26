import { logger } from '../../config/logger.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { Order } from '../orders/order.model.js';
import { createOrderWithNumber } from '../orders/orderNumber.js';
import { resolveLineItems } from '../orders/orderItemResolver.js';
import { Shipment } from '../shipments/shipment.model.js';
import { computeAmountBreakdown } from '../../services/pricing.service.js';
import { canTransition, transitionState } from '../../services/stateMachine.service.js';
import { scheduleOrderEvent } from '../webhooks/webhooks.service.js';
import { PublicApiError } from './publicApi.errors.js';
import { internalStatusesFor, publicStatus, serializePublicOrder } from './publicOrder.serializer.js';

/** Statuses in which a client may still edit or cancel. */
const RECEIVED_STATUSES = ['created', 'approved'];

function isTestKey(apiKey) {
  return apiKey.mode === 'test';
}

/** Every public query is confined to the key's tenant, API orders, and the key's mode. */
function scopeFilter(apiKey) {
  return { tenantId: apiKey.tenantId, source: 'api', testMode: isTestKey(apiKey) };
}

function normalizeCountry(c) {
  const v = String(c ?? '').trim();
  if (!v || /^india$/i.test(v)) return 'IN';
  return v.toUpperCase();
}

/** Field-level address checks beyond schema shape (couriers need these). */
function addressDetails(addr) {
  const details = [];
  const add = (field, code, message) => details.push({ param: `shipping_address.${field}`, code, message });
  if (addr.country === 'IN' && !/^\d{6}$/.test(addr.pincode)) add('pincode', 'invalid_pincode', 'Indian pincodes have 6 digits');
  if (String(addr.phone).replace(/\D/g, '').length < 10) add('phone', 'invalid_phone', 'Phone must have at least 10 digits');
  return details;
}

async function findExisting(apiKey, externalId) {
  return Order.findOne({ ...scopeFilter(apiKey), 'apiRef.externalId': externalId });
}

function orderExists(order) {
  return new PublicApiError(409, 'order_exists', `An order with external_id "${order.apiRef.externalId}" already exists`, {
    param: 'external_id',
    details: [{ param: 'external_id', code: 'order_exists', message: String(order._id) }],
  });
}

/** Same best-effort stock movement as storefront redemptions; drift is reconciled in /platform/inventory. */
async function applyInventory(order) {
  try {
    const { applyInventoryTransaction } = await import('../catalog/inventory.service.js');
    for (const line of order.items) {
      const product = await CatalogProduct.findById(line.catalogProductId).select('inventory');
      if (product?.inventory?.mode !== 'physical') continue;
      await applyInventoryTransaction({
        productId: line.catalogProductId,
        variantSku: line.sku,
        type: 'reduce',
        qty: line.qty,
        reason: `API order ${order.orderNumber}`,
        relatedOrderId: order._id,
        consumeReserved: (product.inventory.reserved ?? 0) >= line.qty,
      });
    }
  } catch (err) {
    logger.warn({ orderId: String(order._id), err: err?.message }, 'API order inventory movement failed');
  }
}

/**
 * Billing hook — API orders are not charged yet (decision deferred).
 * When billing lands: debit the tenant wallet here with ledger
 * createTransaction({ type: 'order_payment', idempotencyKey: `order_payment:${order._id}` }).
 */
async function chargeApiOrder(_order) {}

async function loadShipment(order) {
  return Shipment.findOne({ orderId: order._id, tenantId: order.tenantId }).lean();
}

export async function serializeWithShipment(order) {
  return serializePublicOrder(order, await loadShipment(order));
}

/** POST /orders */
export async function createApiOrder({ apiKey, body }) {
  const testMode = isTestKey(apiKey);
  const existing = await findExisting(apiKey, body.external_id);
  if (existing) throw orderExists(existing);

  const shippingAddress = {
    name: body.shipping_address.name,
    phone: body.shipping_address.phone,
    line1: body.shipping_address.line1,
    line2: body.shipping_address.line2 ?? '',
    city: body.shipping_address.city,
    state: body.shipping_address.state,
    pincode: String(body.shipping_address.pincode).replace(/\s+/g, ''),
    country: normalizeCountry(body.shipping_address.country),
  };
  const details = addressDetails(shippingAddress);

  const { items, errors } = await resolveLineItems({
    tenantId: apiKey.tenantId,
    connectionId: null,
    requireActiveCatalog: true,
    lines: body.items.map((i) => ({
      sku: i.sku,
      productId: i.product_id,
      variantId: i.variant_id,
      qty: i.quantity,
      variant: { size: i.size, color: i.color },
      artworkUrl: i.artwork_url,
    })),
  });
  for (const e of errors) details.push({ param: `items[${e.index}].${e.field ?? 'sku'}`, code: e.code, message: e.message });
  if (details.length) {
    throw new PublicApiError(422, 'validation_failed', details.length === 1 ? details[0].message : `${details.length} problems with this order`, {
      param: details[0].param,
      details,
    });
  }

  let order;
  try {
    order = await createOrderWithNumber({
      tenantId: apiKey.tenantId,
      source: 'api',
      testMode,
      apiRef: { apiKeyId: apiKey._id, externalId: body.external_id },
      customerSnapshot: {
        name: body.customer?.name ?? shippingAddress.name,
        email: body.customer?.email ?? '',
        phone: body.customer?.phone ?? shippingAddress.phone,
      },
      shippingAddress,
      items,
      amountBreakdown: computeAmountBreakdown(items),
      notes: body.notes,
      metadata: body.metadata,
      status: 'created',
      statusHistory: [
        { status: 'created', at: new Date(), actorUserId: null, note: `Submitted via API key "${apiKey.name}"` },
      ],
    });
  } catch (err) {
    // Two concurrent submissions of the same external_id: the loser reports the winner.
    if (err?.code === 11000 && err?.keyPattern?.['apiRef.externalId']) {
      const winner = await findExisting(apiKey, body.external_id);
      if (winner) throw orderExists(winner);
    }
    throw err;
  }

  if (!testMode) {
    await applyInventory(order);
    await chargeApiOrder(order);
  }
  return serializePublicOrder(order);
}

async function loadOrder(apiKey, id) {
  const filter = { ...scopeFilter(apiKey) };
  // Strict hex check: isValidObjectId() also accepts any 12-char string (e.g. an order number).
  if (/^[a-f\d]{24}$/i.test(String(id))) filter._id = id;
  else filter.orderNumber = String(id);
  const order = await Order.findOne(filter);
  if (!order) throw new PublicApiError(404, 'resource_missing', `No order ${id}`, { param: 'id' });
  return order;
}

/** GET /orders/:id */
export async function getApiOrder({ apiKey, id }) {
  return serializeWithShipment(await loadOrder(apiKey, id));
}

/** GET /orders — newest first, cursor = last order id seen. */
export async function listApiOrders({ apiKey, query }) {
  // Coerce: query values may arrive as raw strings (Express 5 req.query keeps the unparsed query).
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const filter = { ...scopeFilter(apiKey) };
  if (query.status) filter.status = { $in: internalStatusesFor(query.status) };
  if (query.external_id) filter['apiRef.externalId'] = String(query.external_id);
  if (query.updated_since) filter.updatedAt = { $gte: new Date(query.updated_since) };
  if (query.starting_after) {
    const cursor = await Order.findOne({ ...scopeFilter(apiKey), _id: query.starting_after }).select('createdAt').lean();
    if (!cursor) throw new PublicApiError(400, 'invalid_cursor', 'starting_after does not match one of your orders', { param: 'starting_after' });
    filter.$or = [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }];
  }
  const rows = await Order.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const shipments = page.length
    ? await Shipment.find({ orderId: { $in: page.map((o) => o._id) }, tenantId: apiKey.tenantId }).lean()
    : [];
  const shipmentByOrder = new Map(shipments.map((s) => [String(s.orderId), s]));
  return {
    object: 'list',
    data: page.map((o) => serializePublicOrder(o, shipmentByOrder.get(String(o._id)))),
    has_more: rows.length > limit,
    next_cursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
  };
}

/** PATCH /orders/:id — address/customer/notes/metadata while still received. */
export async function updateApiOrder({ apiKey, id, body }) {
  const order = await loadOrder(apiKey, id);
  if (!RECEIVED_STATUSES.includes(order.status)) {
    throw new PublicApiError(409, 'order_locked', `Order is ${publicStatus(order.status)} and can no longer be changed`);
  }
  if (body.shipping_address) {
    const merged = { ...order.shippingAddress?.toObject?.() ?? order.shippingAddress, ...body.shipping_address };
    merged.pincode = String(merged.pincode ?? '').replace(/\s+/g, '');
    merged.country = normalizeCountry(merged.country);
    const details = addressDetails(merged);
    if (details.length) throw new PublicApiError(422, 'validation_failed', details[0].message, { param: details[0].param, details });
    order.shippingAddress = merged;
  }
  if (body.customer) order.customerSnapshot = { ...order.customerSnapshot?.toObject?.() ?? order.customerSnapshot, ...body.customer };
  if (body.notes !== undefined) order.notes = body.notes;
  if (body.metadata !== undefined) order.metadata = body.metadata;
  order.internalNotes.push({ body: `Updated via API key "${apiKey.name}"` });
  await order.save();
  // Status didn't change, so the save hook stays silent; data did — tell subscribers.
  scheduleOrderEvent(order, 'order.updated');
  return serializeWithShipment(order);
}

/** POST /orders/:id/cancel */
export async function cancelApiOrder({ apiKey, id, reason }) {
  const order = await loadOrder(apiKey, id);
  if (order.status === 'cancelled') return serializeWithShipment(order);
  if (!RECEIVED_STATUSES.includes(order.status) || !canTransition('order', order.status, 'cancelled')) {
    throw new PublicApiError(409, 'order_not_cancellable', `Order is ${publicStatus(order.status)} and can no longer be cancelled — contact ShelfMerch support`);
  }
  transitionState('order', order, 'cancelled', null, `Cancelled via API${reason ? `: ${reason}` : ''}`);
  await order.save();
  return serializeWithShipment(order);
}

/** Internal path the sandbox walks to reach each public status. */
const SIMULATE_PATH = ['approved', 'in_production', 'qc_pending', 'packed', 'shipped', 'delivered'];
const SIMULATE_TARGET = { in_production: 'in_production', shipped: 'shipped', delivered: 'delivered' };

/** POST /orders/:id/simulate — test keys only; advances a test order like production would. */
export async function simulateApiOrder({ apiKey, id, status }) {
  if (!isTestKey(apiKey)) {
    throw new PublicApiError(403, 'test_mode_only', 'simulate is only available with a test API key (smk_test_…)');
  }
  const order = await loadOrder(apiKey, id);
  const target = SIMULATE_TARGET[status];
  const targetIdx = SIMULATE_PATH.indexOf(target);
  const currentIdx = SIMULATE_PATH.indexOf(order.status);
  if (order.status === 'cancelled' || currentIdx >= targetIdx) {
    throw new PublicApiError(409, 'invalid_transition', `Order is ${publicStatus(order.status)}; cannot move to ${status}`);
  }
  // Save after every step so each public status change is observed (webhooks).
  for (const step of SIMULATE_PATH.slice(currentIdx + 1, targetIdx + 1)) {
    transitionState('order', order, step, null, 'Sandbox simulation');
    if (step === 'shipped' && !order.trackingNumber) order.trackingNumber = `TEST${String(order._id).slice(-8).toUpperCase()}`;
    await order.save();
  }
  return serializeWithShipment(order);
}
