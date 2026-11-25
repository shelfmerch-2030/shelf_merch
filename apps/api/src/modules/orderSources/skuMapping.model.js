import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';

/**
 * Client SKU → ShelfMerch catalog product (+ variant, artwork).
 * Without a mapping an external line item cannot be produced.
 */
const skuMappingSchema = new mongoose.Schema(
  {
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSourceConnection', default: null },
    externalSku: { type: String, required: true, trim: true },
    catalogProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct', required: true },
    variant: {
      size: { type: String, default: '' },
      color: { type: String, default: '' },
    },
    artworkUrl: { type: String, default: '' },
    /** Optional price override charged to the client per unit; default is catalog basePriceInr. */
    unitPriceInr: { type: Number, default: null },
    /** Set when a bulk catalog-match run created this mapping (so "Undo run" can remove it). */
    createdByRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogMatchRun', default: null },
  },
  { timestamps: true },
);

skuMappingSchema.plugin(tenantScopePlugin);
skuMappingSchema.index({ tenantId: 1, connectionId: 1, externalSku: 1 }, { unique: true });

export const SkuMapping = mongoose.model('SkuMapping', skuMappingSchema);
