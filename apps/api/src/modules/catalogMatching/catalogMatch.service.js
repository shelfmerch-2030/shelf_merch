import { logger } from '../../config/logger.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { SkuMapping } from '../orderSources/skuMapping.model.js';
import { OrderSourceConnection } from '../orderSources/orderSourceConnection.model.js';
import { fetchClientCatalog } from '../orderSources/adapters/customRest.adapter.js';
import { connectionContext } from '../orderSources/orderSourceSync.service.js';
import { CatalogMatchItem, CatalogMatchRun } from './catalogMatch.models.js';
import { THRESHOLDS, indexCatalog, matchRow } from './catalogMatch.engine.js';
import { MAX_ROWS } from './catalogMatch.sources.js';

const CATALOG_FIELDS = 'sku name brand category subcategory childCategory group material variants status';

async function loadCatalogIndex() {
  const products = await CatalogProduct.find({ status: 'active' }).select(CATALOG_FIELDS).lean();
  return indexCatalog(products);
}

function mappingKey({ tenantId, connectionId }) {
  return { tenantId, connectionId: connectionId ?? null };
}

/**
 * Compare client rows with our catalog and record every decision.
 * Auto-mapped rows get a SkuMapping straight away; existing mappings are never touched.
 */
export async function executeRun({ run, rows }) {
  const tenantId = run.tenantId;
  const counts = { scanned: rows.length, autoMapped: 0, review: 0, noMatch: 0, alreadyMapped: 0, invalid: 0 };

  const index = await loadCatalogIndex();
  const skus = [...new Set(rows.map((r) => r.sku).filter(Boolean))];
  const existing = await SkuMapping.find({ ...mappingKey(run), externalSku: { $in: skus } }).select('externalSku').lean();
  const existingBySku = new Map(existing.map((m) => [m.externalSku, m._id]));
  const seen = new Set();

  const items = [];
  const newMappings = [];
  rows.forEach((client, i) => {
    const base = { tenantId, runId: run._id, row: i + 2, client }; // +2: header row, 1-based
    if (!client.sku) {
      counts.invalid += 1;
      items.push({ ...base, status: 'invalid', reviewReason: 'Row has no SKU' });
      return;
    }
    if (seen.has(client.sku)) {
      counts.invalid += 1;
      items.push({ ...base, status: 'invalid', reviewReason: `Duplicate SKU ${client.sku} in this file` });
      return;
    }
    seen.add(client.sku);
    if (existingBySku.has(client.sku)) {
      counts.alreadyMapped += 1;
      items.push({ ...base, status: 'already_mapped', mappingId: existingBySku.get(client.sku) });
      return;
    }
    const result = matchRow(client, index);
    const item = { ...base, status: result.decision, bestScore: result.bestScore, candidates: result.candidates, reviewReason: result.reviewReason ?? '' };
    if (result.decision === 'auto_mapped') {
      counts.autoMapped += 1;
      const best = result.candidates[0];
      newMappings.push({ item, mapping: mappingDoc(run, client, best) });
    } else if (result.decision === 'review') counts.review += 1;
    else counts.noMatch += 1;
    items.push(item);
  });

  if (newMappings.length) {
    const created = await SkuMapping.insertMany(newMappings.map((m) => m.mapping), { ordered: false }).catch((err) => {
      // A concurrent manual mapping for the same SKU wins; those rows become review items.
      logger.warn({ runId: String(run._id), err: err?.message }, 'Some catalog auto-mappings already existed');
      return err.insertedDocs ?? [];
    });
    const bySku = new Map(created.map((m) => [m.externalSku, m._id]));
    for (const { item, mapping } of newMappings) {
      const id = bySku.get(mapping.externalSku);
      if (id) item.mappingId = id;
      else {
        item.status = 'review';
        item.reviewReason = 'A mapping was created for this SKU while the run was in progress';
        counts.autoMapped -= 1;
        counts.review += 1;
      }
    }
  }

  await CatalogMatchItem.insertMany(items);
  run.counts = counts;
  run.status = 'completed';
  run.finishedAt = new Date();
  await run.save();
  return run;
}

function mappingDoc(run, client, candidate, userVariant) {
  const variant = userVariant ?? candidate.variant;
  // Pin the variant only when the client row names one; otherwise follow each order's size/colour.
  const pin = (client.size || client.color) && variant;
  return {
    tenantId: run.tenantId,
    connectionId: run.connectionId ?? null,
    externalSku: client.sku,
    catalogProductId: candidate.catalogProductId,
    variant: { size: pin ? variant.size ?? '' : '', color: pin ? variant.color ?? '' : '' },
    createdByRunId: run._id,
  };
}

/** Start a run from already-parsed CSV rows (synchronous: rule matching is fast). */
export async function runFromRows({ tenantId, connectionId = null, rows, fileName = '', userId = null }) {
  if (connectionId) await assertConnection(tenantId, connectionId);
  const run = await CatalogMatchRun.create({
    tenantId,
    connectionId,
    source: 'csv',
    fileName,
    thresholds: { auto: THRESHOLDS.auto, review: THRESHOLDS.review },
    createdByUserId: userId,
  });
  try {
    return await executeRun({ run, rows });
  } catch (err) {
    await markFailed(run, err);
    throw err;
  }
}

/** Start a run that pulls the catalog from a custom-API connection's products endpoint. */
export async function runFromConnection({ tenantId, connectionId, userId = null }) {
  const connection = await OrderSourceConnection.findOne({ _id: connectionId, tenantId }).select('+encryptedCredentials');
  if (!connection) throw new NotFoundError('Order source not found');
  if (connection.provider !== 'custom_rest') {
    throw new ApiError(422, 'Catalog import from an API is available for custom API connections; upload a CSV instead', 'CATALOG_SOURCE_UNSUPPORTED');
  }
  const { rows, truncated } = await fetchClientCatalog(connectionContext(connection));
  if (!rows.length) throw new ApiError(422, 'The products endpoint returned no products', 'CATALOG_EMPTY');
  if (rows.length > MAX_ROWS) throw new ApiError(422, `The client catalog has ${rows.length} SKUs; the limit is ${MAX_ROWS} per run`, 'CATALOG_TOO_LARGE');
  const run = await CatalogMatchRun.create({
    tenantId,
    connectionId,
    source: 'custom_api',
    fileName: truncated ? 'products endpoint (first 50 pages)' : 'products endpoint',
    thresholds: { auto: THRESHOLDS.auto, review: THRESHOLDS.review },
    createdByUserId: userId,
  });
  try {
    return await executeRun({ run, rows });
  } catch (err) {
    await markFailed(run, err);
    throw err;
  }
}

async function markFailed(run, err) {
  await CatalogMatchRun.updateOne(
    { _id: run._id, tenantId: run.tenantId },
    { $set: { status: 'failed', error: String(err?.message ?? err).slice(0, 500), finishedAt: new Date() } },
  );
}

async function assertConnection(tenantId, connectionId) {
  const exists = await OrderSourceConnection.exists({ _id: connectionId, tenantId });
  if (!exists) throw new NotFoundError('Order source not found');
}

/** Custom REST connections with a products endpoint configured — usable as a matching source. */
export async function listCatalogConnections({ tenantId }) {
  const rows = await OrderSourceConnection.find({ tenantId, provider: 'custom_rest', 'config.products': { $ne: null } })
    .select('name shopDomain config.products.path')
    .sort({ createdAt: -1 })
    .lean();
  return rows.map((c) => ({ _id: c._id, name: c.name, shopDomain: c.shopDomain, productsPath: c.config?.products?.path ?? '' }));
}

export async function listRuns({ tenantId, connectionId }) {
  const filter = { tenantId };
  if (connectionId !== undefined) filter.connectionId = connectionId ?? null;
  return CatalogMatchRun.find(filter).sort({ createdAt: -1 }).limit(50).lean();
}

export async function getRun({ tenantId, runId }) {
  const run = await CatalogMatchRun.findOne({ _id: runId, tenantId }).lean();
  if (!run) throw new NotFoundError('Matching run not found');
  return run;
}

export async function listItems({ tenantId, runId, status, page: rawPage, limit: rawLimit }) {
  const page = Math.max(1, Number(rawPage) || 1);
  const limit = Math.min(200, Math.max(1, Number(rawLimit) || 50));
  const filter = { tenantId, runId };
  if (status) filter.status = { $in: String(status).split(',') };
  const [items, total] = await Promise.all([
    CatalogMatchItem.find(filter).sort({ bestScore: -1, row: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    CatalogMatchItem.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

async function loadItem(tenantId, itemId) {
  const item = await CatalogMatchItem.findOne({ _id: itemId, tenantId });
  if (!item) throw new NotFoundError('Match item not found');
  const run = await CatalogMatchRun.findOne({ _id: item.runId, tenantId });
  return { item, run };
}

async function recountRun(run) {
  const rows = await CatalogMatchItem.aggregate([
    { $match: { tenantId: run.tenantId, runId: run._id } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  run.counts.autoMapped = by.auto_mapped ?? 0;
  run.counts.review = by.review ?? 0;
  run.counts.noMatch = by.no_match ?? 0;
  await run.save();
}

/**
 * Accept a suggestion (or a product the reviewer picked) → create the mapping.
 * `catalogProductId` defaults to the top candidate; `variant` overrides the matched one.
 */
export async function acceptItem({ tenantId, itemId, catalogProductId, variant, userId = null }) {
  const { item, run } = await loadItem(tenantId, itemId);
  if (!['review', 'no_match', 'rejected', 'undone'].includes(item.status)) {
    throw new ApiError(409, `This SKU is already ${item.status.replace('_', ' ')}`, 'MATCH_ITEM_DECIDED');
  }
  let candidate = catalogProductId
    ? item.candidates.find((c) => String(c.catalogProductId) === String(catalogProductId))
    : item.candidates[0];
  if (!candidate && catalogProductId) {
    const product = await CatalogProduct.findOne({ _id: catalogProductId, status: 'active' }).select('name sku').lean();
    if (!product) throw new NotFoundError('Catalog product not found');
    candidate = { catalogProductId: product._id, name: product.name, sku: product.sku, variant: null };
  }
  if (!candidate) throw new ApiError(422, 'Pick a ShelfMerch product for this SKU', 'MATCH_PRODUCT_REQUIRED');

  const doc = mappingDoc(run, item.client, candidate, variant);
  const mapping = await SkuMapping.findOneAndUpdate(
    { ...mappingKey(run), externalSku: item.client.sku },
    { $setOnInsert: doc },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  if (String(mapping.catalogProductId) !== String(candidate.catalogProductId)) {
    throw new ApiError(409, `${item.client.sku} was mapped to another product in the meantime`, 'MATCH_ALREADY_MAPPED');
  }
  Object.assign(item, { status: 'accepted', mappingId: mapping._id, decidedByUserId: userId, decidedAt: new Date() });
  await item.save();
  await recountRun(run);
  return item.toObject();
}

export async function rejectItem({ tenantId, itemId, userId = null }) {
  const { item, run } = await loadItem(tenantId, itemId);
  if (!['review', 'no_match'].includes(item.status)) {
    throw new ApiError(409, `This SKU is already ${item.status.replace('_', ' ')}`, 'MATCH_ITEM_DECIDED');
  }
  Object.assign(item, { status: 'rejected', decidedByUserId: userId, decidedAt: new Date() });
  await item.save();
  await recountRun(run);
  return item.toObject();
}

/**
 * Accept every review suggestion at or above `minScore` whose variant fits (bulk approve).
 * Ambiguous rows (two products equally likely) are skipped — a person has to pick.
 */
export async function acceptSuggestions({ tenantId, runId, minScore = THRESHOLDS.review, userId = null }) {
  const run = await CatalogMatchRun.findOne({ _id: runId, tenantId });
  if (!run) throw new NotFoundError('Matching run not found');
  const items = await CatalogMatchItem.find({ tenantId, runId, status: 'review', bestScore: { $gte: minScore } });
  let accepted = 0;
  let skipped = 0;
  for (const item of items) {
    if (!item.candidates[0]?.variantOk || item.reviewReason.includes('equally likely')) {
      skipped += 1;
      continue;
    }
    try {
      await acceptItem({ tenantId, itemId: item._id, userId });
      accepted += 1;
    } catch {
      skipped += 1;
    }
  }
  return { accepted, skipped };
}

/** Remove the mappings this run auto-created (manually accepted ones stay). */
export async function undoRun({ tenantId, runId }) {
  const run = await CatalogMatchRun.findOne({ _id: runId, tenantId });
  if (!run) throw new NotFoundError('Matching run not found');
  const items = await CatalogMatchItem.find({ tenantId, runId, status: 'auto_mapped' }).select('_id mappingId');
  const mappingIds = items.map((i) => i.mappingId).filter(Boolean);
  const { deletedCount } = await SkuMapping.deleteMany({ tenantId, _id: { $in: mappingIds }, createdByRunId: run._id });
  await CatalogMatchItem.updateMany({ tenantId, runId, status: 'auto_mapped' }, { $set: { status: 'undone', mappingId: null } });
  run.undoneAt = new Date();
  await recountRun(run);
  return { removedMappings: deletedCount };
}
