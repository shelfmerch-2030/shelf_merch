import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';

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

const orderSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipient', required: true, index: true },
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

orderSchema.plugin(tenantScopePlugin);
orderSchema.plugin(softDeletePlugin);
orderSchema.index({ tenantId: 1, status: 1 });

export const Order = mongoose.model('Order', orderSchema);
