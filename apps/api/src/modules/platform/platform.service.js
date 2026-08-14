import { Order } from '../orders/order.model.js';
import { scheduleOrderInvoiceGeneration } from '../orderInvoices/orderInvoice.hooks.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { Recipient } from '../campaigns/recipient.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { Shipment, SHIPMENT_EXCEPTION_STATUSES } from '../shipments/shipment.model.js';
import { SupportTicket } from '../support/supportTicket.model.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { Collection } from '../collections/collection.model.js';
import { Kit } from '../kits/kit.model.js';
import { Invoice } from '../invoices/invoice.model.js';
import { AuditLog } from '../auditLogs/auditLog.model.js';
import { ProductionTask } from './productionTask.model.js';
import { assertActiveVendor } from '../vendors/vendors.service.js';
import {
  transitionState,
  validNextStatuses,
} from '../../services/stateMachine.service.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { scheduleOrderDispatchedSlackNotification } from '../integrations/slack/slackNotify.service.js';

const OPEN_ORDER_STATUSES = [
  'created',
  'approved',
  'mockup_pending',
  'mockup_approved',
  'in_production',
  'qc_pending',
  'packed',
  'shipped',
];

const PRODUCTION_ORDER_STATUSES = ['mockup_pending', 'mockup_approved', 'in_production', 'qc_pending', 'packed'];

// ---------------------------------------------------------------------------
// Orders (§3.5)
// ---------------------------------------------------------------------------

function buildOrderFilter(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.tenantId) filter.tenantId = query.tenantId;
  if (query.vendorId) filter.vendorId = query.vendorId;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = query.from;
    if (query.to) filter.createdAt.$lte = query.to;
  }
  return filter;
}

export async function listPlatformOrders({ query }) {
  try {
    const { repairMissingKitFulfillmentOrders } = await import('../redemptions/redemptions.service.js');
    await repairMissingKitFulfillmentOrders({});
  } catch (err) {
    console.error('repairMissingKitFulfillmentOrders (platform) failed:', err);
  }

  const { page, limit, skip } = getPagination(query);
  const filter = buildOrderFilter(query);

  const [items, total] = await Promise.all([
    Order.find(filter).setOptions({ skipTenantGuard: true }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter).setOptions({ skipTenantGuard: true }),
  ]);

  const tenantIds = [...new Set(items.map((o) => String(o.tenantId)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean();
  const tenantById = Object.fromEntries(tenants.map((t) => [String(t._id), t]));

  const enriched = items.map((o) => ({
    ...o,
    tenantName: tenantById[String(o.tenantId)]?.name ?? '',
    validNextStatuses: validNextStatuses('order', o.status),
  }));

  return paginatedResponse(enriched, total, { page, limit });
}

export async function getPlatformOrder(orderId) {
  const order = await Order.findById(orderId).setOptions({ skipTenantGuard: true });
  if (!order) throw new NotFoundError('Order not found');
  return order;
}

/** §3.5 order detail — snapshot items, recipient, timeline, notes, catalog fulfillment assets. */
export async function getPlatformOrderDetail(orderId) {
  const order = await getPlatformOrder(orderId);
  const [tenant, campaign, recipient, shipment, productionTask] = await Promise.all([
    Tenant.findOne({ _id: order.tenantId }).select('name slug status').lean(),
    Campaign.findOne({ _id: order.campaignId, tenantId: order.tenantId }).select('name type shopId kitId').lean(),
    Recipient.findOne({ _id: order.recipientId, tenantId: order.tenantId })
      .select('name email phone redemptionStatus')
      .lean(),
    Shipment.findOne({ orderId: order._id, tenantId: order.tenantId }).lean(),
    ProductionTask.findOne({ orderId: order._id }).lean(),
  ]);

  const catalogIds = [
    ...new Set(
      (order.items ?? [])
        .map((item) => item.catalogProductId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const catalogProducts = catalogIds.length
    ? await CatalogProduct.find({ _id: { $in: catalogIds } })
        .select('name baseImageUrl maskImageUrl primaryImageUrl imageUrls printAreas physicalDimensions dpi variants')
        .lean()
    : [];
  const productById = Object.fromEntries(catalogProducts.map((p) => [String(p._id), p]));

  // Resolve print artwork + Konva placement from shop collections or kit branding.
  const artworkByProductId = {};
  const placementByProductId = {};
  const designedMockupByProductId = {};
  if (campaign?.shopId) {
    const collections = await Collection.find({
      $or: [{ shopId: campaign.shopId }, { shopIds: campaign.shopId }],
      tenantId: order.tenantId,
      status: { $ne: 'archived' },
    })
      .select('productRefs artworkUrl')
      .lean();
    for (const col of collections) {
      for (const ref of col.productRefs ?? []) {
        const pid = String(ref.catalogProductId);
        if (col.artworkUrl && !artworkByProductId[pid]) {
          artworkByProductId[pid] = col.artworkUrl;
        }
        if (ref.placement && !placementByProductId[pid]) {
          placementByProductId[pid] = ref.placement;
        }
        if (ref.mockupUrl && !designedMockupByProductId[pid]) {
          designedMockupByProductId[pid] = ref.mockupUrl;
        }
      }
    }
  }
  let kitArtworkUrl = '';
  if (campaign?.type === 'kit' && campaign?.kitId) {
    const kit = await Kit.findOne({ _id: campaign.kitId, tenantId: order.tenantId })
      .select('artworkUrl productRefs')
      .lean();
    kitArtworkUrl = kit?.artworkUrl || '';
    if (kitArtworkUrl) {
      for (const item of order.items ?? []) {
        if (item.catalogProductId) {
          artworkByProductId[String(item.catalogProductId)] = kitArtworkUrl;
        }
      }
    }
    for (const ref of kit?.productRefs ?? []) {
      const pid = String(ref.catalogProductId);
      if (ref.placement && !placementByProductId[pid]) {
        placementByProductId[pid] = ref.placement;
      }
      if (ref.mockupUrl && !designedMockupByProductId[pid]) {
        designedMockupByProductId[pid] = ref.mockupUrl;
      }
    }
  }

  const obj = order.toObject();
  const items = (obj.items ?? []).map((item) => {
    const pid = item.catalogProductId ? String(item.catalogProductId) : '';
    const product = pid ? productById[pid] : null;
    const artworkUrl =
      item.artworkUrl || (pid ? artworkByProductId[pid] ?? '' : '') || (!pid ? kitArtworkUrl : '');
    const placement = pid ? placementByProductId[pid] ?? null : null;
    const designedMockupUrl =
      (pid ? designedMockupByProductId[pid] ?? '' : '') || (!pid && item.imageUrl ? item.imageUrl : '');
    return {
      ...item,
      artworkUrl,
      placement,
      product: product
        ? {
            _id: product._id,
            name: product.name,
            baseImageUrl: product.baseImageUrl ?? '',
            maskImageUrl: product.maskImageUrl ?? '',
            primaryImageUrl: product.primaryImageUrl ?? '',
            imageUrls: product.imageUrls ?? [],
            printAreas: product.printAreas ?? [],
            variants: product.variants ?? [],
            artworkUrl,
            placement,
            designedMockupUrl,
          }
        : item.imageUrl
          ? {
              _id: null,
              name: item.name,
              baseImageUrl: '',
              maskImageUrl: '',
              primaryImageUrl: item.imageUrl,
              imageUrls: [item.imageUrl],
              printAreas: [],
              variants: [],
              artworkUrl,
              placement: null,
              designedMockupUrl: item.imageUrl,
            }
          : null,
    };
  });

  return {
    ...obj,
    items,
    validNextStatuses: validNextStatuses('order', order.status),
    tenant,
    campaign,
    recipient,
    shipment,
    productionTask,
  };
}

/** §3.5 — platform-only status override, always through the state machine. */
export async function updatePlatformOrderStatus({ orderId, status, note, actor }) {
  const order = await getPlatformOrder(orderId);
  const priorStatus = order.status;
  transitionState('order', order, status, actor, note ?? '');
  await order.save();
  scheduleOrderDispatchedSlackNotification(
    order,
    priorStatus !== 'shipped' && order.status === 'shipped',
  );
  return order;
}

export async function assignVendorToOrder({ orderId, vendorId }) {
  await assertActiveVendor(vendorId);
  const order = await getPlatformOrder(orderId);
  order.vendorId = vendorId;
  await order.save();
  return order;
}

export async function addOrderNote({ orderId, body, actorUserId }) {
  const order = await getPlatformOrder(orderId);
  order.internalNotes.push({ body, authorUserId: actorUserId, at: new Date() });
  await order.save();
  return order;
}

/** Ops uploads a mockup → order moves approved → mockup_pending for tenant sign-off. */
export async function attachOrderMockup({ orderId, url, actor }) {
  const order = await getPlatformOrder(orderId);
  order.mockupUrl = url;
  if (order.status === 'approved') {
    transitionState('order', order, 'mockup_pending', actor, 'Mockup uploaded');
  }
  await order.save();
  return order;
}

async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `SM-${year}-`;
  const latest = await Order.findOne({ orderNumber: { $regex: `^${prefix}` } })
    .sort({ orderNumber: -1 })
    .select('orderNumber')
    .setOptions({ skipTenantGuard: true, includeDeleted: true })
    .lean();
  let seq = 1;
  if (latest?.orderNumber) {
    const parsed = Number.parseInt(String(latest.orderNumber).slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed >= 0) seq = parsed + 1;
  }
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

/**
 * §3.5 replacement — zero-charge clone, no wallet debit, linked via
 * replacementOfOrderId. The original moves issue_raised → replacement_processing.
 */
export async function createReplacementOrder({ orderId, reason, actor }) {
  const original = await getPlatformOrder(orderId);

  if (original.status !== 'issue_raised') {
    transitionState('order', original, 'issue_raised', actor, `Replacement requested: ${reason}`);
  }
  transitionState('order', original, 'replacement_processing', actor, reason);

  const obj = original.toObject();
  const replacement = await Order.create({
    tenantId: obj.tenantId,
    campaignId: obj.campaignId,
    recipientId: obj.recipientId,
    orderNumber: await nextOrderNumber(),
    items: obj.items.map(({ _id, ...item }) => item),
    shippingAddress: obj.shippingAddress,
    // Zero-charge: the replacement never debits the wallet.
    amountBreakdown: { subtotal: 0, serviceFee: 0, gst: 0, total: 0 },
    status: 'created',
    statusHistory: [
      { status: 'created', at: new Date(), actorUserId: actor?.userId ?? null, note: `Replacement of ${obj.orderNumber}: ${reason}` },
    ],
    replacementOfOrderId: original._id,
  });

  scheduleOrderInvoiceGeneration(replacement);
  await original.save();
  return { original, replacement };
}

// ---------------------------------------------------------------------------
// Production (§3.6)
// ---------------------------------------------------------------------------

export async function getProductionBoard() {
  const [tasks, orders] = await Promise.all([
    ProductionTask.find({ status: { $nin: ['completed'] } }).sort({ createdAt: -1 }).lean(),
    Order.find({ status: { $in: PRODUCTION_ORDER_STATUSES } })
      .setOptions({ skipTenantGuard: true })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const taskBuckets = {};
  for (const task of tasks) {
    taskBuckets[task.status] ??= { count: 0, tasks: [] };
    taskBuckets[task.status].count += 1;
    taskBuckets[task.status].tasks.push(task);
  }

  const orderBuckets = Object.fromEntries(PRODUCTION_ORDER_STATUSES.map((s) => [s, { count: 0, orders: [] }]));
  for (const order of orders) {
    orderBuckets[order.status].count += 1;
    orderBuckets[order.status].orders.push(order);
  }

  return { taskBuckets, orderBuckets, totalTasks: tasks.length, totalOrders: orders.length };
}

export async function listProductionTasks({ query }) {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.tenantId) filter.tenantId = query.tenantId;
  if (query.assignedTo) filter.assignedTo = { $regex: query.assignedTo, $options: 'i' };

  const [items, total] = await Promise.all([
    ProductionTask.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ProductionTask.countDocuments(filter),
  ]);
  return paginatedResponse(
    items.map((t) => ({ ...t, validNextStatuses: validNextStatuses('productionTask', t.status) })),
    total,
    { page, limit },
  );
}

export async function getProductionTask(taskId) {
  const task = await ProductionTask.findById(taskId);
  if (!task) throw new NotFoundError('Production task not found');
  return task;
}

/** §3.6 — tasks may only be created from mockup_approved orders. */
export async function createProductionTask({ orderId, assignedTo = '', expectedDispatchAt = null, actor }) {
  const order = await getPlatformOrder(orderId);
  if (order.status !== 'mockup_approved') {
    throw new ApiError(
      422,
      `Production tasks require a mockup_approved order (current: "${order.status}")`,
      'ORDER_NOT_READY',
    );
  }
  const existing = await ProductionTask.findOne({
    orderId: order._id,
    status: { $nin: ['completed', 'issue'] },
  });
  if (existing) {
    throw new ApiError(409, 'An active production task already exists for this order', 'TASK_EXISTS');
  }

  const task = await ProductionTask.create({
    tenantId: order.tenantId,
    orderId: order._id,
    assignedTo,
    expectedDispatchAt,
    status: 'created',
    statusHistory: [{ status: 'created', at: new Date(), actorUserId: actor?.userId ?? null, note: '' }],
  });

  // Kicking off production advances the order.
  transitionState('order', order, 'in_production', actor, 'Production task created');
  await order.save();

  return task;
}

async function syncOrderWithTaskStatus(task, status, actor) {
  const order = await Order.findOne({ _id: task.orderId, tenantId: task.tenantId });
  if (!order) return;
  if (status === 'qc_pending' && order.status === 'in_production') {
    transitionState('order', order, 'qc_pending', actor, 'Production QC started');
    await order.save();
  }
}

export async function updateProductionTaskStatus({ taskId, status, note, actor }) {
  const task = await getProductionTask(taskId);
  transitionState('productionTask', task, status, actor, note ?? '');
  await task.save();
  await syncOrderWithTaskStatus(task, status, actor);
  return task;
}

/**
 * §3.6 QC — pass moves the task to packing and the order toward packed;
 * fail loops the task back to in_production with a reason (order stays put,
 * tenant is notified of the delay by the caller).
 */
export async function recordQcResult({ taskId, passed, reason = '', photoUrl = '', actor }) {
  const task = await getProductionTask(taskId);
  if (task.status !== 'qc_pending') {
    throw new ApiError(422, `QC can only be recorded in qc_pending (current: "${task.status}")`, 'NOT_IN_QC');
  }
  if (!passed && !reason) {
    throw new ApiError(422, 'QC failure requires a reason', 'REASON_REQUIRED');
  }

  if (photoUrl) task.qcPhotos.push({ url: photoUrl, at: new Date() });
  task.qcResult = passed ? 'passed' : 'failed';
  task.qcFailReason = passed ? '' : reason;

  const order = await Order.findOne({ _id: task.orderId, tenantId: task.tenantId });

  if (passed) {
    transitionState('productionTask', task, 'packing', actor, 'QC passed');
    if (order && order.status === 'in_production') {
      transitionState('order', order, 'qc_pending', actor, 'QC passed');
    }
    if (order && order.status === 'qc_pending') {
      transitionState('order', order, 'packed', actor, 'QC passed');
    }
  } else {
    transitionState('productionTask', task, 'in_production', actor, `QC failed: ${reason}`);
  }

  await task.save();
  if (order) await order.save();
  return task;
}

export async function updateProductionTaskFields({ taskId, patch }) {
  const task = await getProductionTask(taskId);
  const allowed = ['assignedTo', 'expectedDispatchAt', 'mockupUrl', 'productionSheetUrl'];
  for (const key of allowed) {
    if (patch[key] !== undefined) task[key] = patch[key];
  }
  if (patch.note) task.notes.push({ body: patch.note, authorUserId: patch.actorUserId ?? null, at: new Date() });
  if (patch.qcPhotoUrl) task.qcPhotos.push({ url: patch.qcPhotoUrl, at: new Date() });
  await task.save();
  return task;
}

// ---------------------------------------------------------------------------
// Audit logs (§6)
// ---------------------------------------------------------------------------

function buildAuditFilter(query) {
  const filter = {};
  if (query.tenantId) filter.tenantId = query.tenantId;
  if (query.actorUserId) filter.actorUserId = query.actorUserId;
  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = query.from;
    if (query.to) filter.createdAt.$lte = query.to;
  }
  return filter;
}

export async function listAuditLogs({ query }) {
  const { page, limit, skip } = getPagination(query);
  const filter = buildAuditFilter(query);

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return paginatedResponse(items, total, { page, limit });
}

// ---------------------------------------------------------------------------
// Dashboard (§2)
// ---------------------------------------------------------------------------

export async function getDashboard() {
  const openTicketStatuses = ['open', 'in_progress', 'waiting_on_customer'];

  const [
    activeTenants,
    gmvAgg,
    ordersInProgress,
    orderPipeline,
    productionQueue,
    shipmentExceptions,
    lowStockProducts,
    openSupportTickets,
    supportQueue,
    unpaidInvoiceAgg,
    topTenantsAgg,
    topProductsAgg,
  ] = await Promise.all([
    Tenant.countDocuments({ status: { $in: ['active', 'trial'] } }),
    Order.aggregate([
      { $match: { status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, gmv: { $sum: '$amountBreakdown.total' } } },
    ]),
    Order.countDocuments({ status: { $in: OPEN_ORDER_STATUSES } }).setOptions({ skipTenantGuard: true }),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ProductionTask.aggregate([
      { $match: { status: { $ne: 'completed' } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Shipment.aggregate([
      { $match: { status: { $in: SHIPMENT_EXCEPTION_STATUSES } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    CatalogProduct.find({
      status: 'active',
      'inventory.mode': 'physical',
      $expr: { $lte: ['$inventory.available', '$inventory.lowStockThreshold'] },
    })
      .select('name sku inventory')
      .limit(10)
      .lean(),
    SupportTicket.countDocuments({ status: { $in: openTicketStatuses } }).setOptions({ skipTenantGuard: true }),
    SupportTicket.aggregate([
      { $match: { status: { $in: openTicketStatuses } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { status: 'issued' } },
      { $group: { _id: '$tenantId', outstanding: { $sum: '$totalAmount' } } },
      { $sort: { outstanding: -1 } },
    ]),
    Order.aggregate([
      { $match: { status: { $nin: ['cancelled'] } } },
      { $group: { _id: '$tenantId', gmv: { $sum: '$amountBreakdown.total' }, orders: { $sum: 1 } } },
      { $sort: { gmv: -1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([
      { $match: { status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.qty' } } },
      { $sort: { qty: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const delayedOrders = shipmentExceptions.find((s) => s._id === 'delayed')?.count ?? 0;
  const outstandingPayments = unpaidInvoiceAgg.reduce((sum, r) => sum + r.outstanding, 0);

  const tenantIds = [...new Set([...topTenantsAgg, ...unpaidInvoiceAgg].map((r) => String(r._id)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name').lean();
  const tenantName = Object.fromEntries(tenants.map((t) => [String(t._id), t.name]));

  const criticalAlerts = [];
  if (delayedOrders > 0) criticalAlerts.push({ kind: 'shipments_delayed', count: delayedOrders });
  if (lowStockProducts.length > 0) criticalAlerts.push({ kind: 'low_stock', count: lowStockProducts.length });
  if (openSupportTickets > 0) criticalAlerts.push({ kind: 'open_tickets', count: openSupportTickets });
  if (outstandingPayments > 0) criticalAlerts.push({ kind: 'outstanding_payments', amountInr: outstandingPayments });

  return {
    cards: {
      activeTenants,
      totalGmvInr: gmvAgg[0]?.gmv ?? 0,
      ordersInProgress,
      delayedOrders,
      openSupportTickets,
      lowStockItems: lowStockProducts.length,
      outstandingPaymentsInr: outstandingPayments,
    },
    sections: {
      criticalAlerts,
      orderPipeline: Object.fromEntries(orderPipeline.map((r) => [r._id, r.count])),
      productionQueue: Object.fromEntries(productionQueue.map((r) => [r._id, r.count])),
      shipmentExceptions: Object.fromEntries(shipmentExceptions.map((r) => [r._id, r.count])),
      lowStockAlerts: lowStockProducts.map((p) => ({
        productId: p._id,
        name: p.name,
        sku: p.sku,
        available: p.inventory?.available ?? 0,
        threshold: p.inventory?.lowStockThreshold ?? 0,
      })),
      supportQueue: Object.fromEntries(supportQueue.map((r) => [r._id, r.count])),
      financeRisk: unpaidInvoiceAgg.slice(0, 5).map((r) => ({
        tenantId: r._id,
        tenantName: tenantName[String(r._id)] ?? '',
        outstandingInr: r.outstanding,
      })),
      topTenants: topTenantsAgg.map((r) => ({
        tenantId: r._id,
        tenantName: tenantName[String(r._id)] ?? '',
        gmvInr: r.gmv,
        orders: r.orders,
      })),
      topProducts: topProductsAgg.map((r) => ({ name: r._id, qty: r.qty })),
    },
  };
}
