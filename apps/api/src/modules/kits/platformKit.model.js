import mongoose from 'mongoose';

// §3.3 — platform-curated kit bundles (distinct from tenant-scoped Kit drafts).
const platformKitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    packaging: { type: String, enum: ['none', 'box', 'premium_box'], default: 'box' },
    eligibleCampaignTypes: { type: [String], default: [] },
    approxValueInr: { type: Number, default: 0 },
    imageUrls: { type: [String], default: [] },
    /** Explicit curated gallery roles — URLs must already exist in imageUrls. */
    heroImage: { type: String, default: '' },
    /** Marketing gallery shots shown in kit preview (subset of imageUrls). */
    galleryImages: { type: [String], default: [] },
    itemImages: [
      {
        imageUrl: { type: String, required: true },
        label: { type: String, default: '' },
      },
    ],
    variantImages: [
      {
        imageUrl: { type: String, required: true },
        label: { type: String, default: '' },
      },
    ],
    items: [
      {
        catalogProductId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'CatalogProduct',
          required: true,
        },
        variantSku: { type: String, default: '' },
        qty: { type: Number, default: 1 },
      },
    ],
    // Rules/config a Super Admin attaches to a predefined kit.
    rules: {
      fixedComposition: { type: Boolean, default: true }, // tenants use as-is vs may edit
      customizationAllowed: { type: Boolean, default: true }, // logo branding permitted
      minQtyPerRecipient: { type: Number, default: 1 },
      maxQtyPerRecipient: { type: Number, default: 1 },
    },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    // Provenance — set when a kit is created from an import (e.g. Shopify) so the
    // same bundle is not re-created and can be reconciled on re-import.
    source: {
      provider: { type: String, default: 'manual' }, // 'manual' | 'shopify'
      domain: { type: String, default: '' },
      externalId: { type: String, default: '' },
      handle: { type: String, default: '' },
      // Manual Catalog ↔ Kits choice; import must not reclassify when set.
      kindOverride: { type: String, enum: ['catalog', 'kit'], default: undefined },
    },
  },
  { timestamps: true },
);

platformKitSchema.index({ 'source.provider': 1, 'source.externalId': 1 });

export const PlatformKit = mongoose.model('PlatformKit', platformKitSchema);
