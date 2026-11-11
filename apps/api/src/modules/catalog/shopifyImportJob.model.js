import mongoose from 'mongoose';

const breakdownSchema = new mongoose.Schema(
  {
    imported: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  { _id: false },
);

// Platform catalog jobs deliberately have no tenant scope or credential fields.
const shopifyImportJobSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['products', 'kits'], required: true },
    domain: { type: String, required: true },
    status: { type: String, enum: ['queued', 'processing', 'done', 'failed'], default: 'queued' },
    imported: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    products: { type: breakdownSchema, default: () => ({}) },
    kits: { type: breakdownSchema, default: () => ({}) },
    items: [{
      _id: false,
      title: String,
      status: { type: String, enum: ['imported', 'updated', 'skipped', 'failed'] },
      reason: String,
      kind: { type: String, enum: ['product', 'kit'] },
    }],
    error: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const ShopifyImportJob = mongoose.model('ShopifyImportJob', shopifyImportJobSchema);
