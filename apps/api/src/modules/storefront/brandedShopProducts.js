import { Collection } from '../collections/collection.model.js';
import { collectionsForShopFilter } from '../collections/collectionQueries.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { withEnabledVariants } from '../catalog/catalogFilters.js';
import { bootstrapActiveListingKeys } from '../shops/shopCatalogSync.js';
import { listingKey } from '../shops/listingKeys.js';

export const CATALOG_SELECT =
  'name brand group category description keyFeatures sizeGuide basePriceInr primaryImageUrl imageUrls maskImageUrl baseImageUrl maskBackImageUrl baseBackImageUrl maskLeftImageUrl baseLeftImageUrl maskRightImageUrl baseRightImageUrl variants printAreas physicalDimensions dpi';

/** One storefront row per Branded Swag design (collection × productRef). */
export function mapBrandedListing(col, ref, base) {
  const catalogProductId = String(ref.catalogProductId);
  const collectionId = String(col._id);
  const placements = Array.isArray(ref.placements)
    ? ref.placements
        .filter((p) => p && typeof p === 'object' && String(p.key || '').trim())
        .map((p) => ({
          key: String(p.key).trim(),
          printCxPct: p.printCxPct,
          printCyPct: p.printCyPct,
          printWPct: p.printWPct,
          xPct: p.xPct,
          yPct: p.yPct,
          wPct: p.wPct,
          rot: p.rot,
          ...(p.artworkUrl ? { artworkUrl: p.artworkUrl } : {}),
        }))
    : [];
  return {
    ...base,
    _id: listingKey(collectionId, catalogProductId),
    catalogProductId,
    collectionId,
    collectionName: col.name || '',
    name: ref.name || base.name,
    brand: ref.brand ?? base.brand,
    group: ref.group ?? base.group,
    artworkUrl: col.artworkUrl || '',
    mockupUrl: ref.mockupUrl || '',
    mockupBackUrl: ref.mockupBackUrl || '',
    placement: ref.placement ?? null,
    /** Per print-area placements + artwork — required for multi-area colour tints. */
    placements,
    preferredColors: col.preferredColors || [],
  };
}

/** Accepts a catalog id or a branded listing id (`collectionId:catalogProductId`). */
export function parseBrandedListingProductId(productId) {
  const s = String(productId ?? '');
  const parts = s.split(':');
  if (parts.length === 2 && parts.every((p) => /^[a-f\d]{24}$/i.test(p))) {
    return { collectionId: parts[0], catalogProductId: parts[1] };
  }
  if (/^[a-f\d]{24}$/i.test(s)) {
    return { collectionId: null, catalogProductId: s };
  }
  return null;
}

export async function loadShopCollections(shop, { skipTenantGuard = true } = {}) {
  return Collection.find({
    ...collectionsForShopFilter(shop._id),
    tenantId: shop.tenantId,
    status: { $ne: 'archived' },
  })
    .setOptions(skipTenantGuard ? { skipTenantGuard: true } : undefined)
    .select('name productRefs artworkUrl preferredColors shopPublish createdAt')
    .lean();
}

/** Prefer shop publish time, then collection createdAt — newer first. */
function collectionRecencyMs(col, shopId) {
  const shopKey = String(shopId);
  const published = (col.shopPublish || []).find((p) => String(p.shopId) === shopKey)?.publishedAt;
  const raw = published || col.createdAt || 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Public shop listings: published collections × products that are marked active
 * on this shop (`activeListingKeys`).
 */
export async function buildBrandedProductListings(shop, { skipTenantGuard = true } = {}) {
  await bootstrapActiveListingKeys(shop, shop.tenantId);

  const activeKeys = new Set((shop.activeListingKeys || []).map(String).filter(Boolean));
  if (!activeKeys.size) return [];

  const collections = await loadShopCollections(shop, { skipTenantGuard });
  const catalogIds = [];
  for (const col of collections) {
    for (const ref of col.productRefs || []) {
      const catalogProductId = ref.catalogProductId ? String(ref.catalogProductId) : '';
      if (!catalogProductId) continue;
      const key = listingKey(col._id, catalogProductId);
      if (activeKeys.has(key)) catalogIds.push(catalogProductId);
    }
  }
  const uniqueIds = [...new Set(catalogIds)];
  if (!uniqueIds.length) return [];

  const catalogRows = await CatalogProduct.find({
    status: 'active',
    _id: { $in: uniqueIds },
  })
    .setOptions(skipTenantGuard ? { skipTenantGuard: true } : undefined)
    .select(CATALOG_SELECT)
    .lean();

  const catalogById = new Map(catalogRows.map((row) => [String(row._id), withEnabledVariants(row)]));

  const products = [];
  for (const col of collections) {
    const recency = collectionRecencyMs(col, shop._id);
    const refs = col.productRefs || [];
    // Walk refs newest-last so within a collection the last-added product ranks higher.
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      const catalogProductId = ref.catalogProductId ? String(ref.catalogProductId) : '';
      if (!catalogProductId) continue;
      const key = listingKey(col._id, catalogProductId);
      if (!activeKeys.has(key)) continue;
      const base = catalogById.get(catalogProductId);
      if (!base) continue;
      products.push({
        ...mapBrandedListing(col, ref, base),
        _recency: recency,
        _refIndex: i,
      });
    }
  }

  // Most recently published/added first (featured default takes the first 5).
  products.sort((a, b) => {
    if (b._recency !== a._recency) return b._recency - a._recency;
    if (b._refIndex !== a._refIndex) return b._refIndex - a._refIndex;
    return String(a.name).localeCompare(String(b.name));
  });

  return products.map(({ _recency, _refIndex, ...rest }) => rest);
}

export function mockupUrlFromCollections(collections, collectionId, catalogProductId) {
  if (!collectionId) return '';
  const col = collections.find((c) => String(c._id) === collectionId);
  const ref = col?.productRefs?.find((r) => String(r.catalogProductId) === catalogProductId);
  return ref?.mockupUrl || '';
}

/** Branded listing metadata for order snapshots (collection × catalog product). */
export function resolveBrandedListingSnapshot(collections, listing) {
  const collectionId = listing.collectionId ? String(listing.collectionId) : '';
  const catalogProductId = String(listing.catalogProductId);
  const col = collectionId ? collections.find((c) => String(c._id) === collectionId) : null;
  const ref = col?.productRefs?.find((r) => String(r.catalogProductId) === catalogProductId) ?? null;
  return {
    collectionId,
    name: ref?.name || '',
    brand: ref?.brand || '',
    mockupUrl: ref?.mockupUrl || '',
    artworkUrl: col?.artworkUrl || '',
    placement: ref?.placement ?? null,
    placements: Array.isArray(ref?.placements) ? ref.placements : [],
  };
}
