import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';

const productRefSchema = new mongoose.Schema(
  {
    catalogProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct' },
    brand: String,
    name: String,
    group: String,
    // Pre-baked design mockup (mask + placed artwork flattened to one image) so
    // the design renders as a single asset and flows into orders/production.
    mockupUrl: { type: String, default: '' },
    placement: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const collectionSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    /** Shops this design is assigned to — one collection, many shops. */
    shopIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Shop' }], default: [] },
    code: { type: String, required: true }, // e.g. "C343955972"
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['draft', 'ready', 'archived'], default: 'draft' },
    artworkUrl: { type: String, default: '' },
    productRefs: { type: [productRefSchema], default: [] },
    preferredColors: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isShopSpecific: { type: Boolean, default: false },
  },
  { timestamps: true },
);

collectionSchema.plugin(tenantScopePlugin);
collectionSchema.plugin(softDeletePlugin);
collectionSchema.index({ tenantId: 1, shopId: 1 });
collectionSchema.index({ tenantId: 1, shopIds: 1 });

export const Collection = mongoose.model('Collection', collectionSchema);
export { productRefSchema };
