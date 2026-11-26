import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { Collection } from '../collections/collection.model.js';
import { parseListingKey } from '../shops/listingKeys.js';
import { resolveBrandedListingSnapshot } from '../storefront/brandedShopProducts.js';
import { SkuMapping } from '../orderSources/skuMapping.model.js';

/**
 * Turn client order lines into ShelfMerch Order items (full product snapshot).
 * Used by both the pull integrations (orderSources) and the public Orders API.
 *
 * Each line's `sku` is resolved in this order:
 *   1. a SKU mapping — connection-specific first, then tenant-wide (connectionId null)
 *   2. a branded listing id `collectionId:catalogProductId` from the tenant's collections
 *      (carries the tenant's artwork, print placements and mockup)
 *   3. a ShelfMerch catalog SKU or variant SKU
 * Size/colour pick the catalog variant ("2XL" ≡ "XXL" etc.).
 * A line may instead carry ShelfMerch ids (public Catalog API): `variantId` (exact variant) or
 * `productId` (+ size/colour). Those lines skip SKU resolution entirely.
 */

/** Machine-readable reasons a line could not be resolved (public API error codes). */
export const LINE_ERRORS = {
  missing_sku: 'missing_sku',
  unknown_sku: 'unknown_sku',
  product_unavailable: 'product_unavailable',
  variant_unavailable: 'variant_unavailable',
  invalid_quantity: 'invalid_quantity',
};

/**
 * Comparable size: case/space-insensitive, and "2XL" ≡ "XXL", "3XL" ≡ "XXXL",
 * "Extra Large" ≡ "XL" so client and catalog spellings still match.
 */
export function sizeKey(s) {
  let v = String(s ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  v = v.replace(/^extra/, 'x').replace(/large$/, 'l').replace(/medium$/, 'm').replace(/small$/, 's');
  const m = v.match(/^(\d)x(l|s)$/);
  if (m) v = 'x'.repeat(Number(m[1])) + m[2];
  return v;
}

/**
 * Find the catalog variant for a line.
 * A SKU identifies a variant only when exactly one variant carries it — stores often give every variant
 * the product's SKU (e.g. 36 × "APRN-1007"), and then size/colour must choose among them.
 * `requireUnique` (orders): return null unless size/colour leave exactly one variant, so an ambiguous
 * line is rejected instead of silently getting the first variant. Without it (existence checks), the first
 * match is returned.
 */
export function pickCatalogVariant(product, { sku, size, color }, { requireUnique = false } = {}) {
  let pool = (product.variants ?? []).filter((v) => v.enabled !== false);
  if (sku) {
    const bySku = pool.filter((v) => v.sku && v.sku === sku);
    if (bySku.length === 1) return bySku[0];
    if (bySku.length > 1) pool = bySku;
  }
  const lc = (s) => String(s ?? '').trim().toLowerCase();
  const matches = pool.filter(
    (v) => (!size || sizeKey(v.size) === sizeKey(size)) && (!color || lc(v.color) === lc(color)),
  );
  if (!requireUnique) return matches[0] ?? null;
  // Identical size+colour duplicates are the same variant for production purposes.
  const distinct = new Set(matches.map((v) => `${sizeKey(v.size)}|${lc(v.color)}`));
  return distinct.size === 1 ? matches[0] : null;
}

/** Which options a line must add to pick one variant ("size", "color"). */
function missingOptions(product, { size, color }) {
  const variants = (product.variants ?? []).filter((v) => v.enabled !== false);
  const lc = (s) => String(s ?? '').trim().toLowerCase();
  const missing = [];
  if (!size && new Set(variants.map((v) => sizeKey(v.size))).size > 1) missing.push('size');
  if (!color && new Set(variants.map((v) => lc(v.color))).size > 1) missing.push('color');
  return missing;
}

function firstPlacementArtwork(placements = []) {
  return placements.find((p) => p?.artworkUrl)?.artworkUrl || '';
}

function placementWithoutArtwork(p) {
  if (!p) return null;
  const { artworkUrl, key, ...rest } = p;
  return rest;
}

/**
 * @param {object} args
 * @param {string} args.tenantId
 * @param {string|null} [args.connectionId] pull connection, or null for the public API
 * @param {Array<{ sku, qty, name?, variant?: {size?, color?}, artworkUrl? }>} args.lines
 * @param {boolean} [args.requireActiveCatalog] direct catalog SKUs must be active products
 * @returns {{ items: object[], errors: Array<{ index, code, message }> }}
 *   items are only usable when errors is empty.
 */
export async function resolveLineItems({ tenantId, connectionId = null, lines, requireActiveCatalog = false }) {
  const errors = [];
  const byId = (l) => Boolean(l.variantId || l.productId);
  const skus = [...new Set(lines.filter((l) => !byId(l)).map((l) => String(l.sku ?? '').trim()).filter(Boolean))];

  // 0. ShelfMerch ids (product / variant) from the public Catalog API.
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter(Boolean).map(String))];
  const productIds = [...new Set(lines.map((l) => (l.variantId ? null : l.productId)).filter(Boolean).map(String))];
  const idFilter = { $or: [{ _id: { $in: productIds } }, { 'variants._id': { $in: variantIds } }] };
  if (requireActiveCatalog) idFilter.status = 'active';
  const idProducts = variantIds.length || productIds.length ? await CatalogProduct.find(idFilter).select('+costPriceInr').lean() : [];

  // 1. Mappings: connection-specific beats tenant-wide.
  const mappingFilter = { tenantId, externalSku: { $in: skus } };
  mappingFilter.connectionId = connectionId ? { $in: [connectionId, null] } : null;
  const mappings = skus.length ? await SkuMapping.find(mappingFilter).lean() : [];
  const mappingBySku = new Map();
  for (const m of mappings) {
    const current = mappingBySku.get(m.externalSku);
    if (!current || (m.connectionId && !current.connectionId)) mappingBySku.set(m.externalSku, m);
  }

  // 2. Listing ids → the tenant's collections.
  const listingRefs = skus.filter((s) => !mappingBySku.has(s)).map(parseListingKey).filter(Boolean);
  const collectionIds = [...new Set(listingRefs.map((l) => l.collectionId))];
  const collections = collectionIds.length
    ? await Collection.find({ _id: { $in: collectionIds }, tenantId, status: { $ne: 'archived' } })
        .select('name productRefs artworkUrl')
        .lean()
    : [];

  // 3. Direct catalog / variant SKUs.
  const directSkus = skus.filter((s) => !mappingBySku.has(s) && !parseListingKey(s));
  const directFilter = { $or: [{ sku: { $in: directSkus } }, { 'variants.sku': { $in: directSkus } }] };
  if (requireActiveCatalog) directFilter.status = 'active';
  const directProducts = directSkus.length ? await CatalogProduct.find(directFilter).select('+costPriceInr').lean() : [];

  const neededIds = [
    ...mappings.map((m) => String(m.catalogProductId)),
    ...listingRefs.map((l) => l.catalogProductId),
  ];
  const linked = neededIds.length
    ? await CatalogProduct.find({ _id: { $in: [...new Set(neededIds)] } }).select('+costPriceInr').lean()
    : [];
  const productById = new Map([...linked, ...directProducts, ...idProducts].map((p) => [String(p._id), p]));

  const items = [];
  lines.forEach((line, index) => {
    const sku = String(line.sku ?? '').trim();
    const qty = Number(line.qty);
    const field = line.variantId ? 'variant_id' : line.productId ? 'product_id' : 'sku';
    const fail = (code, message) => errors.push({ index, code, message, field });

    if (!sku && !byId(line)) return fail(LINE_ERRORS.missing_sku, `"${line.name || `Line ${index + 1}`}" has no SKU`);
    if (!Number.isInteger(qty) || qty <= 0) return fail(LINE_ERRORS.invalid_quantity, `Quantity for ${sku} must be a whole number above 0`);

    let product = null;
    let variantHint = line.variant ?? {};
    let skuHint = '';
    let listingSnap = null;
    let exactVariant = null;
    const mapping = byId(line) ? null : mappingBySku.get(sku);
    const listing = mapping || byId(line) ? null : parseListingKey(sku);

    if (line.variantId) {
      product = idProducts.find((p) => (p.variants ?? []).some((v) => String(v._id) === String(line.variantId))) ?? null;
      exactVariant = product?.variants.find((v) => String(v._id) === String(line.variantId)) ?? null;
      if (!product) return fail(LINE_ERRORS.unknown_sku, `Variant ${line.variantId} is not in the ShelfMerch catalog`);
      if (exactVariant.enabled === false) return fail(LINE_ERRORS.variant_unavailable, `${product.name} (${[exactVariant.size, exactVariant.color].filter(Boolean).join(' / ')}) is not available`);
    } else if (line.productId) {
      product = idProducts.find((p) => String(p._id) === String(line.productId)) ?? null;
      if (!product) return fail(LINE_ERRORS.unknown_sku, `Product ${line.productId} is not in the ShelfMerch catalog`);
    } else if (mapping) {
      product = productById.get(String(mapping.catalogProductId)) ?? null;
      // A mapping may pin size, colour or both; whatever it leaves open comes from the order line.
      if (mapping.variant?.size || mapping.variant?.color) {
        variantHint = { size: mapping.variant.size || variantHint.size, color: mapping.variant.color || variantHint.color };
      }
      if (!product) return fail(LINE_ERRORS.product_unavailable, `SKU ${sku} is mapped to a product that no longer exists`);
    } else if (listing) {
      const col = collections.find((c) => String(c._id) === listing.collectionId);
      const ref = col?.productRefs?.find((r) => String(r.catalogProductId) === listing.catalogProductId);
      product = ref ? productById.get(listing.catalogProductId) ?? null : null;
      if (!product) return fail(LINE_ERRORS.unknown_sku, `Listing ${sku} is not one of your branded products`);
      listingSnap = resolveBrandedListingSnapshot(collections, listing);
    } else {
      product =
        directProducts.find((p) => p.sku === sku) ??
        directProducts.find((p) => (p.variants ?? []).some((v) => v.sku === sku)) ??
        null;
      skuHint = sku;
      if (!product) {
        return fail(LINE_ERRORS.unknown_sku, `SKU ${sku}${line.name ? ` ("${line.name}")` : ''} is not mapped to a ShelfMerch product`);
      }
    }

    const catalogVariant =
      exactVariant ??
      pickCatalogVariant(product, { sku: skuHint, size: variantHint.size, color: variantHint.color }, { requireUnique: true });
    if ((product.variants ?? []).some((v) => v.enabled !== false) && !catalogVariant) {
      const wanted = [variantHint.size, variantHint.color].filter(Boolean).join(' / ');
      const exists = pickCatalogVariant(product, { size: variantHint.size, color: variantHint.color });
      const missing = missingOptions(product, variantHint);
      // Never guess: an ambiguous line (e.g. no colour for a tee sold in 6 colours) is rejected.
      return fail(
        LINE_ERRORS.variant_unavailable,
        exists && missing.length
          ? `${product.name}${wanted ? ` in ${wanted}` : ''} comes in several options — send ${missing.join(' and ')}`
          : wanted
            ? `${product.name} is not available in ${wanted}`
            : `${product.name} needs a size/colour`,
      );
    }

    const placements = listingSnap?.placements ?? [];
    items.push({
      catalogProductId: product._id,
      collectionId: listingSnap?.collectionId || null,
      name: listingSnap?.name || product.name,
      sku: catalogVariant?.sku || product.sku,
      variant: {
        size: catalogVariant?.size || variantHint.size || undefined,
        color: catalogVariant?.color || variantHint.color || undefined,
      },
      qty,
      unitPriceInr: mapping?.unitPriceInr ?? catalogVariant?.priceOverrideInr ?? product.basePriceInr,
      costPriceInr: product.costPriceInr ?? 0,
      gstRate: product.gstRate ?? 18,
      hsnCode: product.hsnCode ?? '',
      imageUrl: listingSnap?.mockupUrl || product.primaryImageUrl || product.imageUrls?.[0] || '',
      artworkUrl: line.artworkUrl || mapping?.artworkUrl || listingSnap?.artworkUrl || firstPlacementArtwork(placements) || '',
      placement: listingSnap?.placement || placementWithoutArtwork(placements[0]) || null,
      placements,
    });
  });
  return { items, errors };
}
