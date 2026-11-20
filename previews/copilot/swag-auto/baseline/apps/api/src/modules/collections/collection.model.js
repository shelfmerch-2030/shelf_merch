import mongoose from 'mongoose';
import { tenantScopePlugin } from '../../plugins/tenantScope.plugin.js';
import { softDeletePlugin } from '../../plugins/softDelete.plugin.js';

const productRefSchema = new mongoose.Schema(
  {
    catalogProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct' },
    brand: String,
    name: String,
    group: String,
    /** Pre-baked design mockup (mask + artwork) — served to shop/storefront as-is. */
    mockupUrl: { type: String, default: '' },
    /** Pre-baked back-view design mockup (optional). */
    mockupBackUrl: { type: String, default: '' },
    /** Transparent print-DPI design asset (inches × dpi) — production file, not mockup. */
    designOnlyImageUrl: { type: String, default: '' },
    /** Physical print size persisted with the design so production does not need EXIF. */
    printSpec: {
      type: {
        widthIn: Number,
        heightIn: Number,
        dpi: Number,
        widthPx: Number,
        heightPx: Number,
      },
      default: null,
      _id: false,
    },
    /** Artwork placement — print-area % preferred; canvas % mirrored for legacy thumbs. */
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
    /** Per print-area placements (Area 1, Area 2, …). `placement` mirrors the primary. */
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
          /** Hosted artwork for this print area (colour-tint live composite). */
          artworkUrl: { type: String, default: '' },
        },
      ],
      default: [],
      _id: false,
    },
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
    /** Per-shop publish metadata (collection remains global). */
    shopPublish: {
      type: [
        {
          shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
          publishedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

collectionSchema.plugin(tenantScopePlugin);
collectionSchema.plugin(softDeletePlugin);
collectionSchema.index({ tenantId: 1, shopId: 1 });
collectionSchema.index({ tenantId: 1, shopIds: 1 });

export const Collection = mongoose.model('Collection', collectionSchema);
export { productRefSchema };
