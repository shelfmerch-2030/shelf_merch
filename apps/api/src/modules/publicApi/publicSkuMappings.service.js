import { z } from 'zod';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { SkuMapping } from '../orderSources/skuMapping.model.js';
import { pickCatalogVariant, sizeKey } from '../orders/orderItemResolver.js';
import { PublicApiError } from './publicApi.errors.js';

/**
 * Public API: the client's own SKUs → ShelfMerch products (tenant-wide mappings, the ones `items[].sku`
 * resolves against). Mappings are workspace configuration and are shared by test and live keys.
 */

export const BULK_MAX = 1000;

export const skuParam = z.string().trim().min(1).max(120);

/** Body of PUT /sku-mappings/{sku} and one row of the bulk endpoint (minus `sku`). */
export const mappingInput = z
  .object({
    catalog_sku: z.string().trim().min(1).max(120),
    size: z.string().trim().max(60).optional(),
    color: z.string().trim().max(60).optional(),
    artwork_url: z
      .string()
      .trim()
      .url()
      .max(2000)
      .refine((u) => u.startsWith('https://'), 'artwork_url must be https')
      .nullable()
      .optional(),
  })
  .strict();

const bulkRow = mappingInput.extend({ sku: skuParam }).strict();

function serialize(m, product) {
  const pinned = m.variant?.size || m.variant?.color;
  return {
    object: 'sku_mapping',
    sku: m.externalSku,
    catalog_sku: product?.sku ?? null,
    product_name: product?.name ?? null,
    // null: size/color come from each order line.
    variant: pinned ? { size: m.variant.size || null, color: m.variant.color || null } : null,
    artwork_url: m.artworkUrl || null,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}

const tenantWide = (tenantId) => ({ tenantId, connectionId: null });

/** Active products addressed by product SKU or variant SKU, keyed by the SKU that was asked for. */
async function loadTargets(catalogSkus) {
  const skus = [...new Set(catalogSkus)];
  if (!skus.length) return new Map();
  const products = await CatalogProduct.find({ status: 'active', $or: [{ sku: { $in: skus } }, { 'variants.sku': { $in: skus } }] })
    .select('sku name variants')
    .lean();
  const out = new Map();
  for (const p of products) {
    if (skus.includes(p.sku)) out.set(p.sku, { product: p, variant: null });
    for (const v of p.variants ?? []) {
      if (v.sku && skus.includes(v.sku) && v.enabled !== false && !out.has(v.sku)) out.set(v.sku, { product: p, variant: v });
    }
  }
  return out;
}

/** Input → { catalogProductId, variant, artworkUrl, product } or { error }. */
function resolveTarget(input, targets) {
  const hit = targets.get(input.catalog_sku);
  if (!hit) {
    return { error: { code: 'catalog_sku_not_found', param: 'catalog_sku', message: `No active ShelfMerch product or variant has SKU "${input.catalog_sku}". See GET /products?type=catalog.` } };
  }
  const { product } = hit;
  let variant = { size: '', color: '' };
  if (hit.variant) {
    const v = hit.variant;
    const clash =
      (input.size && sizeKey(input.size) !== sizeKey(v.size)) ||
      (input.color && String(input.color).toLowerCase() !== String(v.color ?? '').toLowerCase());
    if (clash) {
      return { error: { code: 'variant_conflict', param: 'size', message: `"${input.catalog_sku}" is the ${[v.size, v.color].filter(Boolean).join(' / ')} variant; size/color must match it or be omitted` } };
    }
    variant = { size: v.size ?? '', color: v.color ?? '' };
  } else if (input.size || input.color) {
    const v = pickCatalogVariant(product, { size: input.size, color: input.color });
    if (!v) {
      return { error: { code: 'variant_not_found', param: input.size ? 'size' : 'color', message: `${product.name} (${product.sku}) has no ${[input.size, input.color].filter(Boolean).join(' / ')} variant` } };
    }
    // Store the catalog's own spelling ("XXL", not "2xl") so order lines match exactly.
    variant = { size: input.size ? v.size ?? '' : '', color: input.color ? v.color ?? '' : '' };
  }
  return { catalogProductId: product._id, variant, artworkUrl: input.artwork_url ?? '', product };
}

function sameMapping(existing, target) {
  return (
    String(existing.catalogProductId) === String(target.catalogProductId) &&
    (existing.variant?.size ?? '') === target.variant.size &&
    (existing.variant?.color ?? '') === target.variant.color &&
    (existing.artworkUrl ?? '') === target.artworkUrl
  );
}

/** Upsert one mapping given a resolved target. → { result: created|updated|unchanged, mapping } */
async function write(tenantId, sku, target, existing) {
  if (existing && sameMapping(existing, target)) return { result: 'unchanged', doc: existing };
  const doc = await SkuMapping.findOneAndUpdate(
    { ...tenantWide(tenantId), externalSku: sku },
    {
      $set: {
        catalogProductId: target.catalogProductId,
        variant: target.variant,
        artworkUrl: target.artworkUrl,
        // Set explicitly by the client now — a matching run's "undo" must not remove it.
        createdByRunId: null,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
  return { result: existing ? 'updated' : 'created', doc };
}

function toPublicError(error) {
  return new PublicApiError(422, error.code, error.message, { param: error.param });
}

export async function listSkuMappings({ tenantId, query }) {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const filter = tenantWide(tenantId);
  if (query.starting_after) filter.externalSku = { $gt: String(query.starting_after) };
  const rows = await SkuMapping.find(filter).sort({ externalSku: 1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const ids = [...new Set(page.map((r) => String(r.catalogProductId)))];
  const products = ids.length ? await CatalogProduct.find({ _id: { $in: ids } }).select('sku name').lean() : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return {
    object: 'list',
    data: page.map((m) => serialize(m, byId.get(String(m.catalogProductId)))),
    has_more: rows.length > limit,
    next_cursor: rows.length > limit ? page[page.length - 1].externalSku : null,
  };
}

async function findOne(tenantId, sku) {
  return SkuMapping.findOne({ ...tenantWide(tenantId), externalSku: sku }).lean();
}

export async function getSkuMapping({ tenantId, sku }) {
  const m = await findOne(tenantId, sku);
  if (!m) throw new PublicApiError(404, 'sku_mapping_not_found', `No mapping for SKU "${sku}"`);
  const product = await CatalogProduct.findOne({ _id: m.catalogProductId }).select('sku name').lean();
  return serialize(m, product);
}

/** PUT /sku-mappings/{sku} — create or fully replace. → { created, mapping } */
export async function putSkuMapping({ tenantId, sku, body }) {
  const targets = await loadTargets([body.catalog_sku]);
  const target = resolveTarget(body, targets);
  if (target.error) throw toPublicError(target.error);
  const existing = await findOne(tenantId, sku);
  const { result, doc } = await write(tenantId, sku, target, existing);
  return { result, mapping: serialize(doc, target.product) };
}

export async function deleteSkuMapping({ tenantId, sku }) {
  const r = await SkuMapping.deleteOne({ ...tenantWide(tenantId), externalSku: sku });
  if (!r.deletedCount) throw new PublicApiError(404, 'sku_mapping_not_found', `No mapping for SKU "${sku}"`);
  return { object: 'sku_mapping', sku, deleted: true };
}

/**
 * POST /sku-mappings/bulk — up to 1,000 rows, each validated and applied independently (not atomic).
 * Re-sending the same batch is safe: identical rows come back "unchanged".
 */
export async function bulkSkuMappings({ tenantId, rows }) {
  const parsed = rows.map((raw, index) => {
    const r = bulkRow.safeParse(raw);
    if (r.success) return { index, input: r.data };
    const issue = r.error.issues[0];
    return {
      index,
      sku: typeof raw?.sku === 'string' ? raw.sku.trim() : null,
      error: { code: 'invalid_row', param: issue.path.join('.') || null, message: issue.message },
    };
  });

  // The same SKU twice in one batch is ambiguous — reject every occurrence.
  const counts = new Map();
  for (const p of parsed) if (p.input) counts.set(p.input.sku, (counts.get(p.input.sku) ?? 0) + 1);

  const valid = parsed.filter((p) => p.input && counts.get(p.input.sku) === 1);
  const [targets, existingRows] = await Promise.all([
    loadTargets(valid.map((p) => p.input.catalog_sku)),
    valid.length
      ? SkuMapping.find({ ...tenantWide(tenantId), externalSku: { $in: valid.map((p) => p.input.sku) } }).lean()
      : [],
  ]);
  const existingBySku = new Map(existingRows.map((m) => [m.externalSku, m]));

  const data = [];
  const pending = []; // { entry, target, op }
  for (const p of parsed) {
    if (p.error) {
      data.push({ index: p.index, sku: p.sku, result: 'failed', error: p.error });
      continue;
    }
    const { sku } = p.input;
    if (counts.get(sku) > 1) {
      data.push({ index: p.index, sku, result: 'failed', error: { code: 'duplicate_sku', param: 'sku', message: `"${sku}" appears more than once in this batch` } });
      continue;
    }
    const target = resolveTarget(p.input, targets);
    if (target.error) {
      data.push({ index: p.index, sku, result: 'failed', error: target.error });
      continue;
    }
    const existing = existingBySku.get(sku);
    if (existing && sameMapping(existing, target)) {
      data.push({ index: p.index, sku, result: 'unchanged', mapping: serialize(existing, target.product) });
      continue;
    }
    const entry = { index: p.index, sku, result: existing ? 'updated' : 'created' };
    data.push(entry);
    pending.push({
      entry,
      target,
      op: {
        updateOne: {
          filter: { ...tenantWide(tenantId), externalSku: sku },
          update: {
            $set: { catalogProductId: target.catalogProductId, variant: target.variant, artworkUrl: target.artworkUrl, createdByRunId: null },
            $setOnInsert: { unitPriceInr: null },
          },
          upsert: true,
        },
      },
    });
  }

  if (pending.length) {
    // One round trip; unordered so one failing row doesn't stop the rest.
    const failedAt = new Map();
    try {
      await SkuMapping.bulkWrite(pending.map((x) => x.op), { ordered: false, timestamps: true });
    } catch (err) {
      for (const we of err.writeErrors ?? []) failedAt.set(we.index ?? we.err?.index, we.errmsg ?? we.err?.errmsg ?? 'Write failed');
      if (!err.writeErrors?.length) throw err;
    }
    const written = await SkuMapping.find({ ...tenantWide(tenantId), externalSku: { $in: pending.map((x) => x.entry.sku) } }).lean();
    const bySku = new Map(written.map((m) => [m.externalSku, m]));
    pending.forEach((x, i) => {
      if (failedAt.has(i)) {
        x.entry.result = 'failed';
        x.entry.error = { code: 'write_failed', param: null, message: 'Could not save this mapping — retry the row' };
      } else {
        x.entry.mapping = serialize(bySku.get(x.entry.sku), x.target.product);
      }
    });
  }

  data.sort((a, b) => a.index - b.index);
  const summary = { created: 0, updated: 0, unchanged: 0, failed: 0 };
  for (const d of data) summary[d.result] += 1;
  return { object: 'sku_mapping_bulk_result', summary, data };
}
