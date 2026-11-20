import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';

// SUPER_ADMIN_FLOW §3.7 shipment state machine statuses.
export const SHIPMENT_STATUSES = [
  'pending',
  'packed',
  'shipped',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'delayed',
  'rto',
  'lost',
  'damaged',
];

export const SHIPMENT_EXCEPTION_STATUSES = ['delayed', 'rto', 'lost', 'damaged'];

const shipmentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    courier: { type: String, default: '' },
    /** 'delhivery' when manifested via the Delhivery API; '' for manual AWB entry. */
    provider: { type: String, default: '' },
    awb: { type: String, default: '', index: true },
    trackingUrl: { type: String, default: '' },
    eta: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    status: { type: String, enum: SHIPMENT_STATUSES, default: 'pending' },
    statusHistory: [{ status: String, at: Date, actorUserId: mongoose.Schema.Types.ObjectId, note: String }],
    events: [
      {
        status: { type: String, required: true },
        location: { type: String, default: '' },
        note: { type: String, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

shipmentSchema.plugin(tenantScopePlugin);
shipmentSchema.plugin(softDeletePlugin);
shipmentSchema.index({ tenantId: 1, status: 1 });

export const Shipment = mongoose.model('Shipment', shipmentSchema);
