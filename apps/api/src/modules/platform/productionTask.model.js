import mongoose from 'mongoose';

// SUPER_ADMIN_FLOW §3.6 production task state machine statuses.
export const PRODUCTION_TASK_STATUSES = [
  'created',
  'material_pending',
  'mockup_pending',
  'mockup_approved',
  'in_production',
  'printing',
  'embroidery',
  'qc_pending',
  'packing',
  'ready_to_ship',
  'completed',
  'issue',
];

/**
 * Not tenant-guard-scoped: production is a cross-tenant platform concern.
 * tenantId is stored for linkage/reporting only.
 */
const productionTaskSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    // §3.6 — no vendor portal in Phase 1; assignee is free text.
    assignedTo: { type: String, default: '' },
    status: { type: String, enum: PRODUCTION_TASK_STATUSES, default: 'created' },
    statusHistory: [{ status: String, at: Date, actorUserId: mongoose.Schema.Types.ObjectId, note: String }],
    mockupUrl: { type: String, default: '' },
    productionSheetUrl: { type: String, default: '' },
    qcPhotos: [
      {
        url: { type: String, required: true },
        at: { type: Date, default: Date.now },
      },
    ],
    qcResult: { type: String, enum: ['', 'passed', 'failed'], default: '' },
    qcFailReason: { type: String, default: '' },
    qcInspections: [{
      passed: { type: Boolean, required: true },
      reason: { type: String, default: '' },
      notes: { type: String, default: '' },
      inspectedQuantity: { type: Number, required: true, min: 1 },
      failedQuantity: { type: Number, required: true, min: 0 },
      expectedQuantity: { type: Number, required: true },
      checks: {
        product: Boolean,
        artwork: Boolean,
        workmanship: Boolean,
        quantity: Boolean,
        contents: Boolean,
      },
      photoUrls: [String],
      inspectorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      inspectorName: String,
      at: { type: Date, default: Date.now },
    }],
    expectedDispatchAt: { type: Date, default: null },
    notes: [
      {
        body: { type: String, required: true },
        authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, optimisticConcurrency: true },
);

productionTaskSchema.index({ status: 1, createdAt: -1 });
productionTaskSchema.index({ orderId: 1, createdAt: -1, _id: -1 });

export const ProductionTask = mongoose.model('ProductionTask', productionTaskSchema);
