import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

const { ObjectId } = mongoose.Schema.Types;

export const IMPORT_RESULTS = ['imported', 'updated', 'skipped', 'failed'];

/**
 * A ShelfMerch product a client has imported into their own platform (via the public Catalog API).
 * One row per tenant × product — importing again updates it, never duplicates it. Catalog change
 * webhooks go only to tenants that imported the product.
 */
const importedProductSchema = new mongoose.Schema(
  {
    catalogProductId: { type: ObjectId, ref: 'CatalogProduct', required: true },
    firstImportedAt: { type: Date, required: true },
    lastImportedAt: { type: Date, required: true },
    lastImportId: { type: ObjectId, ref: 'CatalogImport', default: null },
    /** The product's updatedAt when last imported — a newer product counts as "updated" on re-import. */
    importedVersion: { type: Date, required: true },
    /** Set when the client stops syncing the product (DELETE /catalog/imported/{id}). */
    removedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
importedProductSchema.plugin(tenantScopePlugin);
importedProductSchema.index({ tenantId: 1, catalogProductId: 1 }, { unique: true });
importedProductSchema.index({ catalogProductId: 1, removedAt: 1 });
export const ImportedProduct = mongoose.model('ImportedProduct', importedProductSchema);

/** One import request and its summary. */
const catalogImportSchema = new mongoose.Schema(
  {
    apiKeyId: { type: ObjectId, ref: 'ApiKey', default: null },
    mode: { type: String, enum: ['live', 'test'], default: 'live' },
    scope: {
      all: { type: Boolean, default: false },
      productIds: { type: [String], default: [] },
      category: { type: String, default: '' },
    },
    status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
    counts: {
      requested: { type: Number, default: 0 },
      imported: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    error: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
catalogImportSchema.plugin(tenantScopePlugin);
catalogImportSchema.index({ tenantId: 1, createdAt: -1 });
export const CatalogImport = mongoose.model('CatalogImport', catalogImportSchema);

/** Per-product outcome of an import (for the summary). */
const catalogImportItemSchema = new mongoose.Schema(
  {
    importId: { type: ObjectId, ref: 'CatalogImport', required: true },
    seq: { type: Number, required: true },
    requestedId: { type: String, default: '' },
    catalogProductId: { type: ObjectId, ref: 'CatalogProduct', default: null },
    sku: { type: String, default: '' },
    name: { type: String, default: '' },
    result: { type: String, enum: IMPORT_RESULTS, required: true },
    reason: { type: String, default: '' },
  },
  { timestamps: false },
);
catalogImportItemSchema.plugin(tenantScopePlugin);
catalogImportItemSchema.index({ tenantId: 1, importId: 1, seq: 1 });
export const CatalogImportItem = mongoose.model('CatalogImportItem', catalogImportItemSchema);

/**
 * Platform-wide: what clients were last told about each product (price, availability, status, content).
 * The change sweep diffs products against this to emit catalog webhooks. Not tenant-scoped.
 */
const catalogPublishStateSchema = new mongoose.Schema(
  {
    catalogProductId: { type: ObjectId, ref: 'CatalogProduct', required: true, unique: true },
    status: { type: String, default: '' },
    priceKey: { type: String, default: '' },
    prices: { type: mongoose.Schema.Types.Mixed, default: null },
    availability: { type: String, default: '' },
    contentHash: { type: String, default: '' },
    productUpdatedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);
export const CatalogPublishState = mongoose.model('CatalogPublishState', catalogPublishStateSchema);

/** Resume point of the change sweep (single document). */
const catalogSyncCursorSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    updatedAt: { type: Date, default: null },
    lastId: { type: ObjectId, default: null },
  },
  { timestamps: false },
);
export const CatalogSyncCursor = mongoose.model('CatalogSyncCursor', catalogSyncCursorSchema);
