import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

export const MATCH_SOURCES = ['csv', 'custom_api'];
export const MATCH_RUN_STATUSES = ['running', 'completed', 'failed'];
export const MATCH_ITEM_STATUSES = [
  'auto_mapped', // created by the run
  'review', // suggested, waiting for a human
  'no_match', // nothing plausible
  'already_mapped', // the client SKU had a mapping before the run (never overwritten)
  'accepted', // a reviewer confirmed a suggestion / picked a product
  'rejected', // a reviewer said "none of these"
  'undone', // auto-mapping reverted by "Undo run"
  'invalid', // row without a SKU
];

/** One bulk comparison of a client's catalog with ours. */
const catalogMatchRunSchema = new mongoose.Schema(
  {
    /** null = tenant-wide mappings (public Orders API); set = one pull integration. */
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSourceConnection', default: null },
    source: { type: String, enum: MATCH_SOURCES, required: true },
    fileName: { type: String, default: '' },
    status: { type: String, enum: MATCH_RUN_STATUSES, default: 'running' },
    thresholds: { auto: Number, review: Number },
    counts: {
      scanned: { type: Number, default: 0 },
      autoMapped: { type: Number, default: 0 },
      review: { type: Number, default: 0 },
      noMatch: { type: Number, default: 0 },
      alreadyMapped: { type: Number, default: 0 },
      invalid: { type: Number, default: 0 },
    },
    error: { type: String, default: '' },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    undoneAt: { type: Date, default: null },
  },
  { timestamps: true },
);
catalogMatchRunSchema.plugin(tenantScopePlugin);
catalogMatchRunSchema.index({ tenantId: 1, connectionId: 1, createdAt: -1 });

const candidateSchema = new mongoose.Schema(
  {
    catalogProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct' },
    name: String,
    sku: String,
    score: Number,
    reasons: [String],
    variant: { type: { size: String, color: String, sku: String }, default: null, _id: false },
    variantOk: Boolean,
  },
  { _id: false },
);

/** One client SKU in a run, with its top candidates and what happened to it. */
const catalogMatchItemSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogMatchRun', required: true },
    row: { type: Number, default: 0 },
    client: {
      sku: { type: String, default: '' },
      barcode: { type: String, default: '' },
      name: { type: String, default: '' },
      brand: { type: String, default: '' },
      model: { type: String, default: '' },
      category: { type: String, default: '' },
      size: { type: String, default: '' },
      color: { type: String, default: '' },
      material: { type: String, default: '' },
      imageUrl: { type: String, default: '' },
    },
    status: { type: String, enum: MATCH_ITEM_STATUSES, required: true },
    bestScore: { type: Number, default: 0 },
    reviewReason: { type: String, default: '' },
    candidates: { type: [candidateSchema], default: [] },
    /** The mapping this item produced or found. */
    mappingId: { type: mongoose.Schema.Types.ObjectId, ref: 'SkuMapping', default: null },
    decidedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
catalogMatchItemSchema.plugin(tenantScopePlugin);
catalogMatchItemSchema.index({ tenantId: 1, runId: 1, status: 1, row: 1 });

export const CatalogMatchRun = mongoose.model('CatalogMatchRun', catalogMatchRunSchema);
export const CatalogMatchItem = mongoose.model('CatalogMatchItem', catalogMatchItemSchema);
