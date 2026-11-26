import mongoose from 'mongoose';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { Category } from '../catalog/category.model.js';
import { PublicApiError } from './publicApi.errors.js';

/**
 * Public Catalog API — ShelfMerch's catalog for clients to import into their own platform and keep in sync.
 * Ids are stable: `id` is the product id, `variants[].id` the variant id (kept across edits and re-imports).
 * Internal fields (cost, supplier, production masks) are never selected.
 */

const PUBLIC_FIELDS = [
  'sku', 'name', 'slug', 'brand', 'description', 'keyFeatures', 'sizeGuide',
  'category', 'subcategory', 'childCategory', 'categoryIds', 'categoryLabels',
  'basePriceInr', 'gstRate', 'hsnCode', 'moq', 'material', 'productionDays',
  'printableAreas', 'customizationMethods', 'customization', 'physicalDimensions',
  'variants', 'imageUrls', 'primaryImageUrl', 'inventory', 'status', 'createdAt', 'updatedAt',
].join(' ');

/** Only `active` products can be ordered; everything else is reported to sync clients as discontinued. */
export const publicProductStatus = (status) => (status === 'active' ? 'active' : 'discontinued');

function availability(p) {
  if (publicProductStatus(p.status) !== 'active') return { status: 'discontinued', quantity: 0 };
  if (p.inventory?.mode === 'made_to_order') return { status: 'made_to_order', quantity: null };
  const qty = Math.max(0, Number(p.inventory?.available ?? 0) - Number(p.inventory?.reserved ?? 0));
  return { status: qty > 0 ? 'in_stock' : 'out_of_stock', quantity: qty };
}

function images(p) {
  const urls = [...new Set([p.primaryImageUrl, ...(p.imageUrls ?? [])].filter(Boolean))];
  return urls.map((url, i) => ({ url, position: i + 1, primary: i === 0 }));
}

export function serializeCatalogProduct(p) {
  const active = publicProductStatus(p.status) === 'active';
  const avail = availability(p);
  return {
    object: 'catalog_product',
    id: String(p._id),
    sku: p.sku,
    name: p.name,
    status: publicProductStatus(p.status),
    brand: p.brand || null,
    description: p.description || '',
    key_features: p.keyFeatures || '',
    size_guide: p.sizeGuide || '',
    url_slug: p.slug || null,
    category: {
      path: [p.category, p.subcategory, p.childCategory].filter(Boolean),
      ids: (p.categoryIds ?? []).map(String),
      labels: p.categoryLabels ?? [],
    },
    images: images(p),
    price: { amount: p.basePriceInr, currency: 'INR', tax_inclusive: true, gst_rate: p.gstRate ?? 18 },
    availability: avail,
    specifications: {
      material: p.material || null,
      hsn_code: p.hsnCode || null,
      gst_rate: p.gstRate ?? 18,
      min_order_quantity: p.moq ?? 1,
      production_days: p.productionDays ?? null,
      dimensions_in: p.physicalDimensions ? { width: p.physicalDimensions.width ?? null, height: p.physicalDimensions.height ?? null } : null,
      printable_areas: p.printableAreas ?? [],
      customization_methods: (p.customization?.length
        ? p.customization.map((c) => ({ method: c.method, printable_area: c.printableArea || null, extra_cost: c.extraCostInr ?? 0 }))
        : (p.customizationMethods ?? []).map((m) => ({ method: m, printable_area: null, extra_cost: 0 }))),
    },
    variants: (p.variants ?? []).map((v) => ({
      id: String(v._id),
      sku: v.sku || p.sku,
      // false when several variants share one SKU: order those by variant id (or product SKU + size/color).
      sku_unique: Boolean(v.sku) && v.sku !== p.sku && (p.variants ?? []).filter((x) => x.sku === v.sku).length === 1,
      size: v.size || null,
      color: v.color || null,
      color_hex: v.colorHex || null,
      material: v.material || null,
      price: { amount: v.priceOverrideInr ?? p.basePriceInr, currency: 'INR', tax_inclusive: true },
      available: active && v.enabled !== false && avail.status !== 'out_of_stock',
    })),
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

// ---- cursor: opaque base64url of "<updatedAt ISO>|<id>" (ordering is updated_at, id ascending) ----
function encodeCursor(p) {
  return Buffer.from(`${new Date(p.updatedAt).toISOString()}|${p._id}`).toString('base64url');
}
function decodeCursor(cursor) {
  const [iso, id] = Buffer.from(String(cursor), 'base64url').toString('utf8').split('|');
  const at = new Date(iso);
  if (!id || Number.isNaN(at.getTime()) || !mongoose.isValidObjectId(id)) {
    throw new PublicApiError(400, 'invalid_cursor', 'cursor is not one returned by this endpoint', { param: 'cursor' });
  }
  return { at, id: new mongoose.Types.ObjectId(id) };
}

/**
 * GET /catalog/products — ordered by updated_at then id, so paging is stable and a client can resume.
 *   status: active (default) | discontinued | all. With `updated_since` the default is `all`, so a sync
 *   sees products that were discontinued since its last run.
 */
export async function listCatalogProducts({ query, importedIds = null }) {
  const limit = Math.min(250, Math.max(1, Number(query.limit) || 100));
  const filter = {};
  const status = query.status || (query.updated_since ? 'all' : 'active');
  // Drafts were never published; they are not part of the public catalog in any state.
  if (status === 'active') filter.status = 'active';
  else if (status === 'discontinued') filter.status = { $in: ['archived', 'discontinued'] };
  else filter.status = { $in: ['active', 'archived', 'discontinued'] };

  if (query.updated_since) filter.updatedAt = { $gte: new Date(query.updated_since) };
  if (query.category) {
    const c = String(query.category);
    const or = [{ category: c }, { subcategory: c }, { childCategory: c }, { categoryLabels: c }];
    if (mongoose.isValidObjectId(c)) or.push({ categoryIds: new mongoose.Types.ObjectId(c) });
    filter.$and = [...(filter.$and ?? []), { $or: or }];
  }
  if (query.ids) {
    const ids = String(query.ids).split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 100 || ids.some((id) => !mongoose.isValidObjectId(id))) {
      throw new PublicApiError(400, 'invalid_ids', 'ids must be up to 100 comma-separated product ids', { param: 'ids' });
    }
    filter._id = { $in: ids };
  }
  // ?imported=true — only products this client imported (ids resolved by the caller).
  if (importedIds) {
    filter.$and = [...(filter.$and ?? []), { _id: { $in: importedIds } }];
  }
  if (query.cursor) {
    const { at, id } = decodeCursor(query.cursor);
    filter.$and = [...(filter.$and ?? []), { $or: [{ updatedAt: { $gt: at } }, { updatedAt: at, _id: { $gt: id } }] }];
  }

  const rows = await CatalogProduct.find(filter).sort({ updatedAt: 1, _id: 1 }).limit(limit + 1).select(PUBLIC_FIELDS).lean();
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return {
    object: 'list',
    data: page.map(serializeCatalogProduct),
    has_more: hasMore,
    next_cursor: page.length ? encodeCursor(page[page.length - 1]) : query.cursor ?? null,
    // Store this and pass it as updated_since on the next sync run (once has_more is false).
    sync_checkpoint: page.length ? new Date(page[page.length - 1].updatedAt).toISOString() : query.updated_since ?? null,
  };
}

export async function getCatalogProduct({ id }) {
  const filter = mongoose.isValidObjectId(id) ? { _id: id } : { sku: String(id) };
  const p = await CatalogProduct.findOne({ ...filter, status: { $ne: 'draft' } }).select(PUBLIC_FIELDS).lean();
  if (!p) throw new PublicApiError(404, 'product_not_found', `No catalog product "${id}"`);
  return serializeCatalogProduct(p);
}

/** GET /catalog/categories — the active category tree, flat with parent ids. */
export async function listCatalogCategories() {
  const rows = await Category.find({ status: 'active' }).sort({ depth: 1, sortOrder: 1, name: 1 }).lean();
  return {
    object: 'list',
    data: rows.map((c) => ({
      object: 'category',
      id: String(c._id),
      name: c.name,
      slug: c.slug,
      parent_id: c.parentId ? String(c.parentId) : null,
      depth: c.depth ?? 0,
    })),
    has_more: false,
  };
}
