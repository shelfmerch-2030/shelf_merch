import { Shop } from '../shops/shop.model.js';
import { Collection } from '../collections/collection.model.js';
import { collectionsForShopFilter } from '../collections/collectionQueries.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * Public, no-auth storefront for a live shop. Returns the shop's branding plus
 * one listing per collection product ref (same catalog SKU + different artwork
 * are separate listings). Only `live` shops are exposed; drafts 404.
 */
export async function getStorefront(shopId) {
  const shop = await Shop.findById(shopId).setOptions({ skipTenantGuard: true });
  if (!shop || shop.status !== 'live') throw new NotFoundError('Shop not found');

  const collections = await Collection.find({
    ...collectionsForShopFilter(shop._id),
    tenantId: shop.tenantId,
    status: { $ne: 'archived' },
  })
    .setOptions({ skipTenantGuard: true })
    .select('productRefs artworkUrl preferredColors')
    .lean();

  const catalogIds = new Set();
  for (const col of collections) {
    for (const ref of col.productRefs || []) {
      if (ref.catalogProductId) catalogIds.add(String(ref.catalogProductId));
    }
  }

  const catalogById = new Map();
  if (catalogIds.size) {
    const rows = await CatalogProduct.find({
      status: 'active',
      _id: { $in: [...catalogIds] },
    })
      .setOptions({ skipTenantGuard: true })
      .select('name brand group category description keyFeatures sizeGuide basePriceInr primaryImageUrl imageUrls maskImageUrl baseImageUrl variants printAreas')
      .lean();
    for (const row of rows) catalogById.set(String(row._id), row);
  }

  const products = [];
  for (const col of collections) {
    const collectionId = String(col._id);
    for (const ref of col.productRefs || []) {
      const catalogProductId = ref.catalogProductId ? String(ref.catalogProductId) : '';
      if (!catalogProductId) continue;
      const base = catalogById.get(catalogProductId);
      if (!base) continue;
      products.push({
        ...base,
        _id: `${collectionId}:${catalogProductId}`,
        catalogProductId,
        collectionId,
        name: ref.name || base.name,
        brand: ref.brand ?? base.brand,
        group: ref.group ?? base.group,
        artworkUrl: col.artworkUrl || '',
        mockupUrl: ref.mockupUrl || '',
        preferredColors: col.preferredColors || [],
      });
    }
  }

  products.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return {
    shop: {
      id: String(shop._id),
      name: shop.name,
      logoUrl: shop.logoUrl || '',
      bannerTheme: shop.bannerConfig?.theme || 'light',
      currencyMode: shop.currencyMode,
    },
    products,
  };
}
