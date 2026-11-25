import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { Collection } from '../collections/collection.model.js';
import { SkuMapping } from '../orderSources/skuMapping.model.js';
import { listingKey } from '../shops/listingKeys.js';
import { resolveBrandedListingSnapshot } from '../storefront/brandedShopProducts.js';

function variantsOf(product) {
  return (product.variants ?? [])
    .filter((v) => v.enabled !== false)
    .map((v) => ({
      sku: v.sku || null,
      size: v.size || null,
      color: v.color || null,
      unit_price: v.priceOverrideInr ?? product.basePriceInr,
    }));
}

function base(product) {
  return {
    object: 'product',
    catalog_sku: product.sku,
    unit_price: product.basePriceInr,
    currency: 'INR',
    variants: variantsOf(product),
  };
}

/**
 * GET /products — what this tenant can put in `items[].sku`:
 *   type=listing — its branded designs (collection × product), with artwork baked in
 *   type=mapped  — its own SKUs mapped to ShelfMerch products (tenant-wide mappings)
 *   type=catalog — the active ShelfMerch catalog (paged; plain blanks, send artwork_url)
 * Default (no type): listings + mapped.
 */
export async function listApiProducts({ apiKey, query }) {
  const tenantId = apiKey.tenantId;
  if (query.type === 'catalog') {
    // Coerce: query values may arrive as raw strings (Express 5 req.query).
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const filter = { status: 'active' };
    const [rows, total] = await Promise.all([
      CatalogProduct.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit)
        .select('sku name basePriceInr variants primaryImageUrl imageUrls').lean(),
      CatalogProduct.countDocuments(filter),
    ]);
    return {
      object: 'list',
      data: rows.map((p) => ({ ...base(p), sku: p.sku, type: 'catalog', name: p.name, image_url: p.primaryImageUrl || p.imageUrls?.[0] || null })),
      has_more: page * limit < total,
      page,
      total,
    };
  }

  const data = [];
  if (!query.type || query.type === 'listing') {
    const collections = await Collection.find({ tenantId, status: { $ne: 'archived' } })
      .select('name productRefs artworkUrl')
      .lean();
    const ids = [...new Set(collections.flatMap((c) => (c.productRefs ?? []).map((r) => String(r.catalogProductId)).filter(Boolean)))];
    const products = ids.length
      ? await CatalogProduct.find({ _id: { $in: ids }, status: 'active' }).select('sku name basePriceInr variants primaryImageUrl').lean()
      : [];
    const byId = new Map(products.map((p) => [String(p._id), p]));
    for (const col of collections) {
      for (const ref of col.productRefs ?? []) {
        const product = byId.get(String(ref.catalogProductId));
        if (!product) continue;
        const snap = resolveBrandedListingSnapshot([col], { collectionId: col._id, catalogProductId: ref.catalogProductId });
        data.push({
          ...base(product),
          sku: listingKey(col._id, ref.catalogProductId),
          type: 'listing',
          name: snap.name || product.name,
          collection: col.name,
          image_url: snap.mockupUrl || product.primaryImageUrl || null,
          has_artwork: Boolean(snap.artworkUrl || snap.placements.some((p) => p.artworkUrl)),
        });
      }
    }
  }

  if (!query.type || query.type === 'mapped') {
    const mappings = await SkuMapping.find({ tenantId, connectionId: null }).lean();
    const ids = [...new Set(mappings.map((m) => String(m.catalogProductId)))];
    const products = ids.length
      ? await CatalogProduct.find({ _id: { $in: ids } }).select('sku name basePriceInr variants primaryImageUrl').lean()
      : [];
    const byId = new Map(products.map((p) => [String(p._id), p]));
    for (const m of mappings) {
      const product = byId.get(String(m.catalogProductId));
      if (!product) continue;
      const pinned = m.variant?.size || m.variant?.color;
      data.push({
        ...base(product),
        sku: m.externalSku,
        type: 'mapped',
        name: product.name,
        image_url: product.primaryImageUrl || null,
        unit_price: m.unitPriceInr ?? product.basePriceInr,
        // A pinned variant ignores size/color on the order line.
        ...(pinned ? { variants: [], fixed_variant: { size: m.variant.size || null, color: m.variant.color || null } } : {}),
      });
    }
  }
  return { object: 'list', data, has_more: false };
}
