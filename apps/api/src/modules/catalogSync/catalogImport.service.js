import mongoose from 'mongoose';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { PublicApiError } from '../publicApi/publicApi.errors.js';
import { ensureBaseline } from './catalogChanges.service.js';
import { CatalogImport, CatalogImportItem, ImportedProduct } from './catalogSync.models.js';

/**
 * Catalog import: a client records which ShelfMerch products it carries on its own platform.
 *   imported — first time (or re-added after removal)
 *   updated  — imported before, and the product changed since the client's last import
 *   skipped  — imported before, unchanged
 *   failed   — unknown id, or the product is not active
 * Importing again never duplicates (one ImportedProduct per tenant × product). The result links the
 * client to our product and variant ids, which it can order with directly (no client SKUs needed).
 */

export const MAX_IMPORT_IDS = 1000;
const CHUNK = 1000;

const PRODUCT_SELECT =
  'sku name slug brand description keyFeatures sizeGuide category subcategory childCategory categoryIds categoryLabels ' +
  'basePriceInr gstRate hsnCode moq material productionDays printableAreas customizationMethods customization ' +
  'physicalDimensions printAreas dpi variants imageUrls primaryImageUrl inventory status createdAt updatedAt';

export function serializeImport(imp) {
  return {
    object: 'catalog_import',
    id: String(imp._id),
    status: imp.status,
    mode: imp.mode,
    scope: { all: imp.scope?.all ?? false, product_ids: imp.scope?.productIds?.length ? imp.scope.productIds : null, category: imp.scope?.category || null },
    summary: { ...imp.counts },
    error: imp.error || null,
    created_at: imp.createdAt,
    finished_at: imp.finishedAt,
  };
}

function categoryFilter(category) {
  const or = [{ category }, { subcategory: category }, { childCategory: category }, { categoryLabels: category }];
  if (mongoose.isValidObjectId(category)) or.push({ categoryIds: new mongoose.Types.ObjectId(category) });
  return { $or: or };
}

export async function runImport({ apiKey, body }) {
  const tenantId = apiKey.tenantId;
  const requestedIds = body.all ? [] : [...new Set(body.product_ids.map(String))];

  const imp = await CatalogImport.create({
    tenantId,
    apiKeyId: apiKey._id,
    mode: apiKey.mode,
    scope: { all: Boolean(body.all), productIds: requestedIds, category: body.category ?? '' },
  });

  try {
    // Resolve what was asked for.
    let products;
    const failures = [];
    if (body.all) {
      const filter = { status: 'active', ...(body.category ? categoryFilter(body.category) : {}) };
      products = await CatalogProduct.find(filter).sort({ _id: 1 }).select(PRODUCT_SELECT).lean();
    } else {
      const valid = requestedIds.filter((id) => mongoose.isValidObjectId(id));
      const found = valid.length ? await CatalogProduct.find({ _id: { $in: valid } }).select(PRODUCT_SELECT).lean() : [];
      const byId = new Map(found.map((p) => [String(p._id), p]));
      products = [];
      for (const id of requestedIds) {
        const p = byId.get(id);
        if (!p || p.status === 'draft') failures.push({ requestedId: id, reason: 'product_not_found' });
        else if (p.status !== 'active') failures.push({ requestedId: id, product: p, reason: 'product_discontinued' });
        else products.push(p);
      }
    }

    const existing = products.length
      ? await ImportedProduct.find({ tenantId, catalogProductId: { $in: products.map((p) => p._id) } }).lean()
      : [];
    const existingById = new Map(existing.map((e) => [String(e.catalogProductId), e]));
    const now = new Date();
    const items = [];
    const writes = [];
    let seq = 0;

    for (const p of products) {
      const prev = existingById.get(String(p._id));
      let result;
      if (!prev || prev.removedAt) result = 'imported';
      else if (new Date(p.updatedAt) > new Date(prev.importedVersion)) result = 'updated';
      else result = 'skipped';
      items.push({ tenantId, importId: imp._id, seq: seq++, requestedId: String(p._id), catalogProductId: p._id, sku: p.sku, name: p.name, result, reason: result === 'skipped' ? 'unchanged_since_last_import' : '' });
      if (result !== 'skipped') {
        writes.push({
          updateOne: {
            filter: { tenantId, catalogProductId: p._id },
            update: {
              $set: { lastImportedAt: now, lastImportId: imp._id, importedVersion: p.updatedAt, removedAt: null },
              $setOnInsert: { firstImportedAt: now },
            },
            upsert: true,
          },
        });
      }
    }
    for (const f of failures) {
      items.push({ tenantId, importId: imp._id, seq: seq++, requestedId: f.requestedId, catalogProductId: f.product?._id ?? null, sku: f.product?.sku ?? '', name: f.product?.name ?? '', result: 'failed', reason: f.reason });
    }

    for (let i = 0; i < writes.length; i += CHUNK) {
      await ImportedProduct.bulkWrite(writes.slice(i, i + CHUNK), { ordered: false });
    }
    // Catalog change webhooks compare against this baseline from now on.
    await ensureBaseline(products);
    for (let i = 0; i < items.length; i += CHUNK) {
      await CatalogImportItem.insertMany(items.slice(i, i + CHUNK), { ordered: false });
    }

    const counts = { requested: body.all ? products.length : requestedIds.length, imported: 0, updated: 0, skipped: 0, failed: 0 };
    for (const it of items) counts[it.result] += 1;
    Object.assign(imp, { status: 'completed', counts, finishedAt: new Date() });
    await imp.save();
  } catch (err) {
    Object.assign(imp, { status: 'failed', error: 'Import failed — retry the request', finishedAt: new Date() });
    await imp.save().catch(() => {});
    throw err;
  }
  return serializeImport(imp.toObject());
}

export async function listImports({ tenantId, query }) {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const rows = await CatalogImport.find({ tenantId }).sort({ createdAt: -1 }).limit(limit).lean();
  return { object: 'list', data: rows.map(serializeImport), has_more: false };
}

async function loadImport(tenantId, id) {
  const imp = mongoose.isValidObjectId(id) ? await CatalogImport.findOne({ _id: id, tenantId }).lean() : null;
  if (!imp) throw new PublicApiError(404, 'import_not_found', `No catalog import "${id}"`);
  return imp;
}

export async function getImport({ tenantId, id }) {
  return serializeImport(await loadImport(tenantId, id));
}

/** GET /catalog/imports/{id}/items?result=failed&limit=&starting_after=<seq> */
export async function listImportItems({ tenantId, id, query }) {
  const imp = await loadImport(tenantId, id);
  const limit = Math.min(1000, Math.max(1, Number(query.limit) || 100));
  const filter = { tenantId, importId: imp._id };
  if (query.result) filter.result = { $in: String(query.result).split(',') };
  if (query.starting_after !== undefined && query.starting_after !== '') filter.seq = { $gt: Number(query.starting_after) };
  const rows = await CatalogImportItem.find(filter).sort({ seq: 1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  return {
    object: 'list',
    data: page.map((r) => ({
      product_id: r.catalogProductId ? String(r.catalogProductId) : r.requestedId || null,
      sku: r.sku || null,
      name: r.name || null,
      result: r.result,
      reason: r.reason || null,
    })),
    has_more: rows.length > limit,
    next_cursor: rows.length > limit ? String(page[page.length - 1].seq) : null,
  };
}

/** GET /catalog/imported — products this client imported (ids + when), for reconciliation. */
export async function listImported({ tenantId, query }) {
  const limit = Math.min(1000, Math.max(1, Number(query.limit) || 100));
  const filter = { tenantId, removedAt: null };
  if (query.starting_after) {
    if (!mongoose.isValidObjectId(query.starting_after)) throw new PublicApiError(400, 'invalid_cursor', 'starting_after must be a product id', { param: 'starting_after' });
    filter.catalogProductId = { $gt: new mongoose.Types.ObjectId(String(query.starting_after)) };
  }
  const rows = await ImportedProduct.find(filter).sort({ catalogProductId: 1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  return {
    object: 'list',
    data: page.map((r) => ({ object: 'imported_product', product_id: String(r.catalogProductId), first_imported_at: r.firstImportedAt, last_imported_at: r.lastImportedAt })),
    has_more: rows.length > limit,
    next_cursor: rows.length > limit ? String(page[page.length - 1].catalogProductId) : null,
  };
}

/** DELETE /catalog/imported/{product_id} — stop syncing (no more catalog webhooks for it). */
export async function removeImported({ tenantId, productId }) {
  const r = mongoose.isValidObjectId(productId)
    ? await ImportedProduct.updateOne({ tenantId, catalogProductId: productId, removedAt: null }, { $set: { removedAt: new Date() } })
    : { matchedCount: 0 };
  if (!r.matchedCount) throw new PublicApiError(404, 'imported_product_not_found', `Product ${productId} is not in your imported products`);
  return { object: 'imported_product', product_id: productId, removed: true };
}

/** Product ids a tenant imported (for `?imported=true` on the catalog list). */
export async function importedIdsFor(tenantId) {
  return ImportedProduct.distinct('catalogProductId', { tenantId, removedAt: null });
}
