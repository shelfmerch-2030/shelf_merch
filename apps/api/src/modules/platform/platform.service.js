import mongoose from 'mongoose';
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
import { User } from '../users/user.model.js';
import { qcSchema } from './platform.validation.js';
import { qcStatus, taskQcFilter, assertTaskQcPassed, assertOrderFulfillmentTransition, latestProductionTask, productionNextStatuses } from './productionQc.service.js';
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

function listingAssetKey(collectionId, catalogProductId) {
  return collectionId && catalogProductId ? `${String(collectionId)}:${String(catalogProductId)}` : '';
}

function firstPlacementArtworkUrl(placements = []) {
  return placements.find((p) => p?.artworkUrl)?.artworkUrl || '';
}

function placementWithoutArtwork(placement) {
  if (!placement) return null;
  const { key: _key, artworkUrl: _artworkUrl, ...rest } = placement;
  return rest;
}

// ---------------------------------------------------------------------------
// Orders (§3.5)
// ---------------------------------------------------------------------------

function buildOrderFilter(query) {
  // Test-mode API orders never enter ops views unless explicitly asked for.
  // String check too: req.query under Express 5 is the raw (unparsed) query.
  const includeTest = query.includeTest === true || query.includeTest === 'true';
  const filter = includeTest ? {} : { testMode: { $ne: true } };
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
  if (query.qcStatus) {
    // Filter against the latest task, never an older inspection/task for the order.
    const matchingTasks = await ProductionTask.aggregate([
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: '$orderId', task: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$task' } },
      { $match: query.qcStatus === 'not_started' ? { $nor: [taskQcFilter('not_started')] } : taskQcFilter(query.qcStatus) },
      { $project: { orderId: 1 } },
    ]);
    if (query.qcStatus === 'not_started') {
      filter._id = { $nin: matchingTasks.map((t) => t.orderId) };
    } else filter._id = { $in: matchingTasks.map((t) => t.orderId) };
  }

  const [items, total] = await Promise.all([
    Order.find(filter).setOptions({ skipTenantGuard: true }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter).setOptions({ skipTenantGuard: true }),
  ]);

  const tenantIds = [...new Set(items.map((o) => String(o.tenantId)))];
  const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean();
  const tenantById = Object.fromEntries(tenants.map((t) => [String(t._id), t]));
  const tasks = await ProductionTask.find({ orderId: { $in: items.map((o) => o._id) } })
    .select('orderId status qcResult qcFailReason').sort({ createdAt: -1, _id: -1 }).lean();
  const taskByOrder = new Map();
  for (const task of tasks) if (!taskByOrder.has(String(task.orderId))) taskByOrder.set(String(task.orderId), task);

  const enriched = items.map((o) => ({
    ...o,
    tenantName: tenantById[String(o.tenantId)]?.name ?? '',
    productionTask: taskByOrder.get(String(o._id)) ?? null,
    qcStatus: qcStatus(taskByOrder.get(String(o._id))),
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
    // External orders have neither — don't query by undefined (Mongoose would match any row).
    order.campaignId
      ? Campaign.findOne({ _id: order.campaignId, tenantId: order.tenantId }).select('name type shopId kitId').lean()
      : null,
    order.recipientId
      ? Recipient.findOne({ _id: order.recipientId, tenantId: order.tenantId })
          .select('name email phone redemptionStatus')
          .lean()
      : null,
    Shipment.findOne({ orderId: order._id, tenantId: order.tenantId }).lean(),
    latestProductionTask(order._id).lean(),
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
  const artworkByListingKey = {};
  const placementByProductId = {};
  const placementByListingKey = {};
  const placementsByListingKey = {};
  const designedMockupByProductId = {};
  const designedMockupByListingKey = {};
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
        if (!pid) continue;
        const listingKey = listingAssetKey(col._id, pid);
        const refArtworkUrl = col.artworkUrl || firstPlacementArtworkUrl(ref.placements);
        const refPlacement = ref.placement || placementWithoutArtwork(ref.placements?.[0]);
        if (listingKey && refArtworkUrl) {
          artworkByListingKey[listingKey] = refArtworkUrl;
        }
        if (listingKey && refPlacement) {
          placementByListingKey[listingKey] = refPlacement;
        }
        if (listingKey && Array.isArray(ref.placements)) {
          placementsByListingKey[listingKey] = ref.placements;
        }
        if (listingKey && ref.mockupUrl) {
          designedMockupByListingKey[listingKey] = ref.mockupUrl;
        }
        if (refArtworkUrl && !artworkByProductId[pid]) {
          artworkByProductId[pid] = refArtworkUrl;
        }
        if (refPlacement && !placementByProductId[pid]) {
          placementByProductId[pid] = refPlacement;
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
    const listingKey = listingAssetKey(item.collectionId, pid);
    const product = pid ? productById[pid] : null;
    const artworkUrl =
      item.artworkUrl ||
      (listingKey ? artworkByListingKey[listingKey] ?? '' : '') ||
      (pid ? artworkByProductId[pid] ?? '' : '') ||
      (!pid ? kitArtworkUrl : '');
    const placement =
      item.placement ||
      (listingKey ? placementByListingKey[listingKey] ?? null : null) ||
      (pid ? placementByProductId[pid] ?? null : null);
    const placements =
      (Array.isArray(item.placements) && item.placements.length ? item.placements : null) ||
      (listingKey ? placementsByListingKey[listingKey] ?? [] : []);
    const designedMockupUrl =
      item.imageUrl ||
      (listingKey ? designedMockupByListingKey[listingKey] ?? '' : '') ||
      (pid ? designedMockupByProductId[pid] ?? '' : '') ||
      (!pid && item.imageUrl ? item.imageUrl : '');
    return {
      ...item,
      artworkUrl,
      placement,
      placements,
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
            placements,
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
    // External orders: show the client's end customer in the recipient slot.
    recipient: recipient ?? (obj.customerSnapshot ? { ...obj.customerSnapshot } : null),
    shipment,
    productionTask,
    qcStatus: qcStatus(productionTask),
  };
}

/** §3.5 — platform-only status override, always through the state machine. */
export async function updatePlatformOrderStatus({ orderId, status, note, actor }) {
  const order = await getPlatformOrder(orderId);
  const priorStatus = order.status;
  await assertOrderFulfillmentTransition(order, status);
  transitionState('order', order, status, actor, note ?? '');
  await order.save();
  // Overriding into production must still put the order on the production board.
  if (status === 'in_production' && priorStatus !== 'in_production') {
    const activeTask = await ProductionTask.exists({
      orderId: order._id,
      status: { $nin: ['completed', 'issue'] },
    });
    if (!activeTask) await createProductionTask({ orderId: order._id, actor });
  }
  const becameShipped = priorStatus !== 'shipped' && order.status === 'shipped';
  scheduleOrderDispatchedSlackNotification(order, becameShipped);
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
    source: obj.source ?? 'campaign',
    campaignId: obj.campaignId,
    recipientId: obj.recipientId,
    // externalRef is deliberately not copied: it is unique per client order.
    customerSnapshot: obj.customerSnapshot,
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

  if (replacement.campaignId) scheduleOrderInvoiceGeneration(replacement);
  await original.save();
  return { original, replacement };
}

// ---------------------------------------------------------------------------
// Production (§3.6)
// ---------------------------------------------------------------------------

export async function getProductionBoard() {
  const [tasks, orders] = await Promise.all([
    ProductionTask.find({ status: { $nin: ['completed'] } }).sort({ createdAt: -1 }).lean(),
    Order.find({ status: { $in: PRODUCTION_ORDER_STATUSES }, testMode: { $ne: true } })
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
  if (query.qcStatus) Object.assign(filter, taskQcFilter(query.qcStatus));

  const [items, total] = await Promise.all([
    ProductionTask.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ProductionTask.countDocuments(filter),
  ]);
  const orderIds = items.map((t) => t.orderId);
  const [shipments, orders] = await Promise.all([
    Shipment.find({ orderId: { $in: orderIds } })
      .setOptions({ skipTenantGuard: true })
      .select('orderId courier awb trackingUrl status provider')
      .lean(),
    Order.find({ _id: { $in: orderIds } }).setOptions({ skipTenantGuard: true }).select('orderNumber items.qty status').lean(),
  ]);
  const shipmentByOrder = Object.fromEntries(shipments.map((s) => [String(s.orderId), s]));
  const orderNumberById = Object.fromEntries(orders.map((o) => [String(o._id), o.orderNumber]));
  const orderById = Object.fromEntries(orders.map((o) => [String(o._id), o]));
  return paginatedResponse(
    items.map((t) => ({
      ...t,
      orderNumber: orderNumberById[String(t.orderId)] ?? '',
      expectedQuantity: (orderById[String(t.orderId)]?.items ?? []).reduce((sum, item) => sum + item.qty, 0),
      orderStatus: orderById[String(t.orderId)]?.status ?? '',
      qcStatus: qcStatus(t),
      shipment: shipmentByOrder[String(t.orderId)] ?? null,
      validNextStatuses: productionNextStatuses(t, orderById[String(t.orderId)]?.status, !!shipmentByOrder[String(t.orderId)]),
    })),
    total,
    { page, limit },
  );
}

export async function getProductionTask(taskId, session = null) {
  const task = await ProductionTask.findById(taskId).session(session);
  if (!task) throw new NotFoundError('Production task not found');
  return task;
}

export async function getProductionTaskDetail(taskId) {
  const task = await getProductionTask(taskId);
  const order = await getPlatformOrder(task.orderId);
  const shipment = await Shipment.findOne({ orderId: task.orderId, tenantId: task.tenantId }).lean();
  return {
    ...task.toObject(), orderNumber: order.orderNumber, orderStatus: order.status,
    expectedQuantity: order.items.reduce((sum, item) => sum + item.qty, 0),
    qcStatus: qcStatus(task), shipment,
    validNextStatuses: productionNextStatuses(task, order.status, !!shipment),
  };
}

/**
 * Tasks can start after order approval; mockup review is optional. An order already in
 * in_production without an active task (e.g. moved there via status override)
 * may also get one, so it shows up on the production board.
 */
export async function createProductionTask({ orderId, assignedTo = '', expectedDispatchAt = null, actor }) {
  const order = await getPlatformOrder(orderId);
  if (!['approved', 'mockup_pending', 'mockup_approved', 'in_production'].includes(order.status)) {
    throw new ApiError(
      422,
      `Production tasks require an approved order (current: "${order.status}")`,
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
  if (order.status !== 'in_production') {
    transitionState('order', order, 'in_production', actor, 'Production task created');
    await order.save();
  }

  return task;
}

async function syncOrderWithTaskStatus(task, status, actor, session) {
  const order = await Order.findOne({ _id: task.orderId, tenantId: task.tenantId }).session(session);
  if (!order) return;
  if (status === 'qc_pending' && order.status === 'in_production') {
    transitionState('order', order, 'qc_pending', actor, 'Production QC started');
    await order.save({ session });
  }
  if (status === 'ready_to_ship' && order.status === 'qc_pending') {
    assertTaskQcPassed(task);
    transitionState('order', order, 'packed', actor, 'Packing completed');
    await order.save({ session });
  }
}

export async function updateProductionTaskStatus({ taskId, status, note, actor }) {
  return mongoose.connection.transaction(async (session) => {
    const task = await getProductionTask(taskId, session);
    const order = await Order.findOne({ _id: task.orderId, tenantId: task.tenantId }).session(session);
    const latest = await latestProductionTask(task.orderId, session);
    const allowedOrderStatuses = status === 'completed' ? ['packed', 'shipped', 'delivered'] : ['in_production', 'qc_pending', 'packed'];
    if (!order || !allowedOrderStatuses.includes(order.status) || String(latest?._id) !== String(task._id)) {
      throw new ApiError(422, 'This order is not available for production changes.', 'ORDER_NOT_READY');
    }
    if (task.status === 'qc_pending' && ['packing', 'in_production'].includes(status)) {
      throw new ApiError(422, 'Use Record QC to pass inspection or return products for rework.', 'QC_REQUIRED');
    }
    if (['packing', 'ready_to_ship', 'completed'].includes(status)) assertTaskQcPassed(task);
    if (status === 'completed') {
      const shipment = await Shipment.exists({ orderId: task.orderId, tenantId: task.tenantId }).session(session);
      if (!shipment) throw new ApiError(422, 'Request a shipment before completing this task.', 'SHIPMENT_REQUIRED');
    }
    transitionState('productionTask', task, status, actor, note ?? '');
    if (['issue', 'in_production', 'material_pending'].includes(status) && task.qcResult === 'passed') task.qcResult = '';
    if (status === 'issue' && order.status === 'packed') {
      transitionState('order', order, 'issue_raised', actor, note || 'Production issue after packing');
      await order.save({ session });
    }
    await task.save({ session });
    await syncOrderWithTaskStatus(task, status, actor, session);
    return task;
  });
}

/**
 * QC pass authorizes packing; ready_to_ship marks packing complete separately.
 * Failure returns the task to production for rework; previous inspections remain intact.
 */
export async function recordQcResult({ taskId, actor, ...input }) {
  const parsed = qcSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(422, parsed.error.issues.map((i) => i.message).join('; '), 'INVALID_QC');
  const { passed, reason, notes, checks, inspectedQuantity, failedQuantity, photoUrls } = parsed.data;
  return mongoose.connection.transaction(async (session) => {
    const task = await getProductionTask(taskId, session);
    if (task.status !== 'qc_pending') {
      throw new ApiError(422, `QC can only be recorded in qc_pending (current: "${task.status}")`, 'NOT_IN_QC');
    }
    const order = await Order.findOne({ _id: task.orderId, tenantId: task.tenantId }).session(session);
    const latest = await latestProductionTask(task.orderId, session);
    if (!order || !['in_production', 'qc_pending'].includes(order.status) || String(latest?._id) !== String(task._id)) {
      throw new ApiError(422, 'The order is not available for QC.', 'ORDER_NOT_READY');
    }
    const expectedQuantity = order.items.reduce((sum, item) => sum + item.qty, 0);
    if (inspectedQuantity > expectedQuantity || (passed && inspectedQuantity !== expectedQuantity)) {
      throw new ApiError(422, 'A pass requires inspection of every ordered unit; inspected quantity cannot exceed the order.', 'INVALID_QC_QUANTITY');
    }
    if (photoUrls.some((url) => !task.qcPhotos.some((photo) => photo.url === url))) {
      throw new ApiError(422, 'Upload QC photos to this task before recording inspection.', 'INVALID_QC_PHOTO');
    }
    const inspector = await User.findById(actor.userId).select('name').session(session).lean();
    task.qcInspections.push({ passed, reason: passed ? '' : reason, notes, checks, inspectedQuantity, failedQuantity,
      expectedQuantity, photoUrls: [...new Set(photoUrls)], inspectorUserId: actor.userId,
      inspectorName: inspector?.name || actor.name || '', at: new Date() });
    task.qcResult = passed ? 'passed' : 'failed';
    task.qcFailReason = passed ? '' : reason;

    if (passed) {
      transitionState('productionTask', task, 'packing', actor, 'QC passed');
      if (order && order.status === 'in_production') {
        transitionState('order', order, 'qc_pending', actor, 'QC passed');
      }
    } else {
      transitionState('productionTask', task, 'in_production', actor, `QC failed: ${reason}`);
    }

    await task.save({ session });
    await order.save({ session });
    return task;
  });
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
      { $match: { status: { $nin: ['cancelled'] }, testMode: { $ne: true } } },
      { $group: { _id: null, gmv: { $sum: '$amountBreakdown.total' } } },
    ]),
    Order.countDocuments({ status: { $in: OPEN_ORDER_STATUSES }, testMode: { $ne: true } }).setOptions({ skipTenantGuard: true }),
    Order.aggregate([{ $match: { testMode: { $ne: true } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
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
      { $match: { status: { $nin: ['cancelled'] }, testMode: { $ne: true } } },
      { $group: { _id: '$tenantId', gmv: { $sum: '$amountBreakdown.total' }, orders: { $sum: 1 } } },
      { $sort: { gmv: -1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([
      { $match: { status: { $nin: ['cancelled'] }, testMode: { $ne: true } } },
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
