import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';
import { publicStatus } from './publicStatus.js';

export const ORDER_STATUSES = [
  'created',
  'approved',
  'mockup_pending',
  'mockup_approved',
  'in_production',
  'qc_pending',
  'packed',
  'shipped',
  'delivered',
  'issue_raised',
  'replacement_processing',
  'cancelled',
];

/**
 * Non-negotiable #3: cost price and margin never leak to tenant/public
 * responses. Every tenant-facing serializer must run items through this.
 */
export function sanitizeOrderItems(items = []) {
  return items.map((item) => {
    const { costPriceInr, ...safe } = item.toObject ? item.toObject() : item;
    const variant = safe.variant ?? {};
    return {
      ...safe,
      catalogProductId: safe.catalogProductId ? String(safe.catalogProductId) : undefined,
      collectionId: safe.collectionId ? String(safe.collectionId) : undefined,
      variant: {
        size: variant.size ? String(variant.size) : undefined,
        color: variant.color ? String(variant.color) : undefined,
      },
    };
  });
}

/**
 * Where an order came from. Campaign orders (gifting) always carry
 * campaignId + recipientId; external orders are pulled from a client's own
 * store/API (modules/orderSources) and carry externalRef + customerSnapshot.
 */
export const ORDER_SOURCES = ['campaign', 'external', 'api'];

function isCampaignOrder() {
  return (this.source ?? 'campaign') === 'campaign';
}

const orderSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ORDER_SOURCES, default: 'campaign', index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: isCampaignOrder, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipient', required: isCampaignOrder, index: true },
    /** External orders only: the client-side order this was created from. */
    externalRef: {
      type: {
        connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSourceConnection' },
        externalOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalOrder' },
        externalId: String,
        externalNumber: String,
        provider: String,
      },
      default: undefined,
      _id: false,
    },
    /** External/API orders: end customer as given by the client's system. */
    customerSnapshot: {
      type: { name: String, email: String, phone: String },
      default: undefined,
      _id: false,
    },
    /** Public Orders API only: which key submitted it and the client's own order id. */
    apiRef: {
      type: {
        apiKeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiKey' },
        externalId: String,
      },
      default: undefined,
      _id: false,
    },
    /** Client-supplied key/value pairs (public API), echoed back on reads and webhooks. */
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
    /** Client-supplied note for production/shipping (public API). */
    notes: { type: String, default: undefined },
    /**
     * Placed with a test API key: never enters production, inventory or ops
     * queues; can be advanced with the sandbox simulate endpoint.
     */
    testMode: { type: Boolean, default: false, index: true },
    orderNumber: { type: String, required: true, unique: true },
    // Non-negotiable #4: full product snapshot at order time (price, cost,
    // GST, HSN, image). costPriceInr is internal-only — see sanitizeOrderItems.
    items: [
      {
        catalogProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct' },
        collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', default: null },
        name: String,
        sku: { type: String, default: '' },
        variant: { size: String, color: String },
        qty: Number,
        unitPriceInr: Number,
        costPriceInr: { type: Number, default: 0 },
        gstRate: { type: Number, default: 18 },
        hsnCode: { type: String, default: '' },
        imageUrl: { type: String, default: '' },
        /** Brand logo / kit artwork URL frozen at order time (curated kits). */
        artworkUrl: { type: String, default: '' },
        /** Branded listing placement frozen at order time. */
        placement: {
          type: {
            printCxPct: Number,
            printCyPct: Number,
            printWPct: Number,
            xPct: Number,
            yPct: Number,
            wPct: Number,
            rot: Number,
          },
          default: null,
          _id: false,
        },
        /** Per print-area placements/artwork frozen from the selected branded listing. */
        placements: {
          type: [
            {
              key: { type: String, default: '' },
              printCxPct: Number,
              printCyPct: Number,
              printWPct: Number,
              xPct: Number,
              yPct: Number,
              wPct: Number,
              rot: Number,
              artworkUrl: { type: String, default: '' },
            },
          ],
          default: [],
          _id: false,
        },
      },
    ],
    shippingAddress: {
      name: String,
      phone: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'IN' },
    },
    amountBreakdown: {
      subtotal: Number,
      packaging: { type: Number, default: 0 },
      shipping: { type: Number, default: 0 },
      serviceFee: Number,
      gst: Number,
      total: Number,
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'created' },
    statusHistory: [{ status: String, at: Date, actorUserId: mongoose.Schema.Types.ObjectId, note: String }],
    trackingNumber: { type: String, default: '' },
    /** Set when ORDER_DISPATCHED Slack notification was claimed/sent (dedupe). */
    slackDispatchNotifiedAt: { type: Date, default: null },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    mockupUrl: { type: String, default: '' },
    // §3.5 — replacement = zero-charge clone, linked back to the original.
    replacementOfOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    internalNotes: [
      {
        body: { type: String, required: true },
        authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

/**
 * Webhook events for public-API orders, emitted from one place: every code
 * path that changes an order's status (ops UI, production, shipments, API,
 * sandbox) ends in order.save(). Only changes of the *public* status emit
 * (e.g. in_production → qc_pending is silent). Updates via updateOne bypass
 * this by design — they are repairs, not workflow transitions.
 */
orderSchema.post('init', function rememberLoadedStatus() {
  this.$locals.loadedStatus = this.status;
});
orderSchema.pre('save', function markNew() {
  this.$locals.wasNew = this.isNew;
});
orderSchema.post('save', function emitPublicStatusEvent(doc) {
  if (doc.source !== 'api' || !doc.status) return;
  const before = doc.$locals.wasNew ? null : doc.$locals.loadedStatus;
  doc.$locals.loadedStatus = doc.status;
  if (!doc.$locals.wasNew && (before === undefined || publicStatus(before) === publicStatus(doc.status))) return;
  const type = doc.$locals.wasNew ? 'order.received' : `order.${publicStatus(doc.status)}`;
  void import('../webhooks/webhooks.service.js')
    .then(({ scheduleOrderEvent }) => scheduleOrderEvent(doc, type))
    .catch(() => {});
});

orderSchema.plugin(tenantScopePlugin);
orderSchema.plugin(softDeletePlugin);
orderSchema.index({ tenantId: 1, status: 1 });
// Second guard (after ExternalOrder's own unique key) against creating two
// Orders for one client order. Replacements do not copy externalRef.
orderSchema.index(
  { 'externalRef.connectionId': 1, 'externalRef.externalId': 1 },
  { unique: true, partialFilterExpression: { 'externalRef.externalId': { $exists: true } } },
);
// One ShelfMerch order per client order id, per tenant and mode (test ids never block live ones).
orderSchema.index(
  { tenantId: 1, testMode: 1, 'apiRef.externalId': 1 },
  { unique: true, partialFilterExpression: { 'apiRef.externalId': { $exists: true } } },
);

export const Order = mongoose.model('Order', orderSchema);
