import crypto from 'node:crypto';
import { logger } from '../../config/logger.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { serializeCatalogProduct } from '../publicApi/publicCatalog.service.js';
import { emitCatalogEvent } from '../webhooks/webhooks.service.js';
import { CatalogPublishState, CatalogSyncCursor, ImportedProduct } from './catalogSync.models.js';

/**
 * Catalog change sweep: diff products changed since the last run against what clients were last told
 * (CatalogPublishState) and emit webhooks to the tenants that imported them. Polling updatedAt catches
 * every write path (save, updateOne, bulkWrite, Shopify re-import, stock movements) and collapses bursts
 * (50 stock movements between runs → at most one availability event).
 */

const CURSOR_KEY = 'catalog-change-sweep';
const PUBLIC_SELECT =
  'sku name slug brand description keyFeatures sizeGuide category subcategory childCategory categoryIds categoryLabels ' +
  'basePriceInr gstRate hsnCode moq material productionDays printableAreas customizationMethods customization ' +
  'physicalDimensions variants imageUrls primaryImageUrl inventory status createdAt updatedAt';

/** What we compare, from the public representation (so only client-visible changes count). */
export function productState(product) {
  const pub = serializeCatalogProduct(product);
  const prices = { product: pub.price.amount, variants: Object.fromEntries(pub.variants.map((v) => [v.id, v.price.amount])) };
  const { availability, price, updated_at: _u, created_at: _c, status, ...content } = pub;
  content.variants = pub.variants.map(({ available: _a, price: _p, ...v }) => v);
  return {
    status: pub.status,
    prices,
    priceKey: JSON.stringify(prices),
    availability: availability.status,
    contentHash: crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex'),
    publicProduct: pub,
  };
}

/** Event types for a state transition (previous null → baseline, no events). */
export function diffEvents(prev, next) {
  if (!prev) return [];
  if (prev.status !== next.status) {
    return [next.status === 'discontinued' ? 'catalog.product.discontinued' : 'catalog.product.updated'];
  }
  if (next.status === 'discontinued') return [];
  const types = [];
  if (prev.priceKey !== next.priceKey) types.push('catalog.product.price_changed');
  if (prev.availability !== next.availability) types.push('catalog.product.availability_changed');
  if (prev.contentHash !== next.contentHash) types.push('catalog.product.updated');
  return types;
}

const stateDoc = (product, s) => ({
  status: s.status,
  priceKey: s.priceKey,
  prices: s.prices,
  availability: s.availability,
  contentHash: s.contentHash,
  productUpdatedAt: product.updatedAt,
  publishedAt: new Date(),
});

/** Record the current state as the baseline if none exists (called on import). */
export async function ensureBaseline(products) {
  if (!products.length) return;
  await CatalogPublishState.bulkWrite(
    products.map((p) => ({
      updateOne: { filter: { catalogProductId: p._id }, update: { $setOnInsert: stateDoc(p, productState(p)) }, upsert: true },
    })),
    { ordered: false },
  );
}

/**
 * Process products updated since the cursor, in (updatedAt, _id) order, up to `maxProducts`.
 * Returns counts; safe to run concurrently-ish (state writes are idempotent upserts).
 */
export async function sweepCatalogChanges({ batchSize = 200, maxProducts = 5000 } = {}) {
  const cursor = (await CatalogSyncCursor.findOne({ key: CURSOR_KEY }).lean()) ?? { updatedAt: null, lastId: null };
  let at = cursor.updatedAt;
  let lastId = cursor.lastId;
  const counts = { scanned: 0, events: 0, deliveriesFor: 0 };

  while (counts.scanned < maxProducts) {
    const filter = at ? { $or: [{ updatedAt: { $gt: at } }, { updatedAt: at, _id: { $gt: lastId } }] } : {};
    const products = await CatalogProduct.find(filter).sort({ updatedAt: 1, _id: 1 }).limit(batchSize).select(PUBLIC_SELECT).lean();
    if (!products.length) break;

    const ids = products.map((p) => p._id);
    const [states, importers] = await Promise.all([
      CatalogPublishState.find({ catalogProductId: { $in: ids } }).lean(),
      ImportedProduct.find({ catalogProductId: { $in: ids }, removedAt: null }).setOptions({ skipTenantGuard: true }).select('tenantId catalogProductId').lean(),
    ]);
    const stateById = new Map(states.map((s) => [String(s.catalogProductId), s]));
    const tenantsById = new Map();
    for (const i of importers) {
      const k = String(i.catalogProductId);
      tenantsById.set(k, [...(tenantsById.get(k) ?? []), i.tenantId]);
    }

    const writes = [];
    for (const product of products) {
      // Drafts are not in the public catalog; skip without a baseline so publishing later is a fresh start.
      if (product.status === 'draft' && !stateById.has(String(product._id))) continue;
      const prev = stateById.get(String(product._id)) ?? null;
      const next = productState(product);
      const types = diffEvents(prev, next);
      const tenants = tenantsById.get(String(product._id)) ?? [];
      for (const type of types) {
        counts.events += 1;
        for (const tenantId of tenants) {
          counts.deliveriesFor += 1;
          await emitCatalogEvent({
            tenantId,
            type,
            data: {
              object: next.publicProduct,
              previous_attributes: prev
                ? {
                    status: prev.status,
                    availability: prev.availability,
                    ...(type === 'catalog.product.price_changed' ? { prices: prev.prices } : {}),
                  }
                : null,
            },
          }).catch((err) => logger.error({ err: err?.message, type, productId: String(product._id) }, 'Catalog event emit failed'));
        }
      }
      if (!prev || types.length || prev.contentHash !== next.contentHash || prev.priceKey !== next.priceKey) {
        writes.push({ updateOne: { filter: { catalogProductId: product._id }, update: { $set: stateDoc(product, next) }, upsert: true } });
      }
    }
    if (writes.length) await CatalogPublishState.bulkWrite(writes, { ordered: false });

    const last = products[products.length - 1];
    at = last.updatedAt;
    lastId = last._id;
    counts.scanned += products.length;
    await CatalogSyncCursor.updateOne({ key: CURSOR_KEY }, { $set: { updatedAt: at, lastId } }, { upsert: true });
    if (products.length < batchSize) break;
  }
  return counts;
}
