import crypto from 'node:crypto';
import {
  CatalogProduct,
  INTERNAL_PRODUCT_FIELDS,
} from './catalogProduct.model.js';
import { Category } from './category.model.js';
import { ApiError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';
import { categoryFilter } from './catalogFilters.js';

/** Fields whose changes are price/tax-sensitive and require a reason (§3.1). */
const SENSITIVE_FIELDS = ['sellingPriceInr', 'basePriceInr', 'costPriceInr', 'gstRate', 'hsnCode'];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Platform DTO: exposes internal cost + margin. Never reuse for tenant routes. */
export function platformProductDto(product) {
  const obj = product.toObject ? product.toObject() : product;
  const selling = obj.basePriceInr ?? 0;
  const cost = obj.costPriceInr ?? 0;
  return {
    ...obj,
    sellingPriceInr: selling,
    marginInr: selling - cost,
    marginPct: selling > 0 ? Math.round(((selling - cost) / selling) * 10000) / 100 : 0,
  };
}

export async function listProducts({ query }) {
  // Catalog imports commonly exceed the global default maxLimit of 100; allow
  // larger pages so the platform list / kit picker can walk the full catalog.
  const { page, limit, skip } = getPagination(query, { defaultLimit: 50, maxLimit: 250 });
  const filter = {
    ...(query.status ? { status: query.status } : {}),
    ...categoryFilter(query.category),
    ...(query.search ? { name: { $regex: query.search, $options: 'i' } } : {}),
  };
  // Products manually moved to Kits stay archived with kindOverride=kit — hide
  // them from live catalog lists (Archived tab still shows them).
  if (query.status !== 'archived') {
    filter['source.kindOverride'] = { $ne: 'kit' };
  }
  const [items, total] = await Promise.all([
    CatalogProduct.find(filter)
      .select(INTERNAL_PRODUCT_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CatalogProduct.countDocuments(filter),
  ]);
  return paginatedResponse(items.map(platformProductDto), total, { page, limit });
}

export async function getProduct(productId) {
  const product = await CatalogProduct.findById(productId).select(INTERNAL_PRODUCT_FIELDS);
  if (!product) throw new NotFoundError('Product not found');
  return product;
}

export async function createProduct(data) {
  const { sellingPriceInr, ...rest } = data;
  await assertCatalogTaxonomy({
    category: rest.category,
    subcategory: rest.subcategory,
    childCategory: rest.childCategory,
  });
  const skuPrefix = data.skuPrefix || 'SM';
  const sku = data.sku || `${skuPrefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const slug = data.slug || slugify(data.name);

  const existing = await CatalogProduct.findOne({ $or: [{ sku }, ...(slug ? [{ slug }] : [])] });
  if (existing) throw new ConflictError('A product with this SKU or slug already exists');

  const product = await CatalogProduct.create({
    ...rest,
    sku,
    slug,
    skuPrefix,
    basePriceInr: sellingPriceInr,
    status: 'draft',
  });
  return getProduct(product._id);
}

export async function updateProduct(productId, patch, reason) {
  const product = await getProduct(productId);

  const touchesSensitive = SENSITIVE_FIELDS.some((f) => patch[f] !== undefined);
  if (touchesSensitive && !reason) {
    throw new ApiError(
      422,
      'Price, GST and HSN changes require a "reason" (audited)',
      'REASON_REQUIRED',
    );
  }

  const { sellingPriceInr, ...rest } = patch;
  if (rest.category !== undefined || rest.subcategory !== undefined || rest.childCategory !== undefined) {
    await assertCatalogTaxonomy({
      category: rest.category !== undefined ? rest.category : product.category,
      subcategory: rest.subcategory !== undefined ? rest.subcategory : product.subcategory,
      childCategory: rest.childCategory !== undefined ? rest.childCategory : product.childCategory,
    });
  }
  const before = platformProductDto(product);
  Object.assign(product, rest);
  if (rest.category !== undefined && product.source?.provider === 'shopify') {
    product.source.categoryAssignedByAdmin = Boolean(String(rest.category || '').trim());
  }
  if (sellingPriceInr !== undefined) product.basePriceInr = sellingPriceInr;
  await product.save();
  return { before, product, touchesSensitive };
}

/** Publish gate (§3.1): cost < sell, GST set, HSN set, ≥1 image. */
export async function publishProduct(productId) {
  const product = await getProduct(productId);
  if (product.status === 'active') return product;

  const problems = [];
  if (!(product.costPriceInr < product.basePriceInr)) {
    problems.push('costPriceInr must be lower than sellingPriceInr');
  }
  if (!(product.gstRate >= 0 && product.gstRate <= 28)) problems.push('gstRate must be set (0–28)');
  if (!product.hsnCode) problems.push('hsnCode is required');
  const hasVisiblePreviewImage = Boolean(
    product.baseImageUrl
      || product.primaryImageUrl
      || product.imageUrls?.length
      || product.printAreas?.some((area) => area?.mockupImageUrl),
  );
  if (!hasVisiblePreviewImage) {
    problems.push('Visible product stage image is required');
  }
  const legacyShopifyImageInMask =
    product.source?.provider === 'shopify'
    && !product.primaryImageUrl
    && !product.imageUrls?.length
    && /^https?:\/\//i.test(product.maskImageUrl || '');
  const hasMarketingImage = Boolean(product.primaryImageUrl || product.imageUrls?.length);
  // Dedicated transparent mask preferred; otherwise fall back to Shopify / marketing primary.
  if ((!product.maskImageUrl || legacyShopifyImageInMask) && !hasMarketingImage) {
    problems.push('Design mask or Shopify primary product image is required');
  }
  if (problems.length) {
    throw new ApiError(422, 'Product is not ready to publish', 'PUBLISH_VALIDATION_FAILED', problems);
  }

  product.status = 'active';
  await product.save();
  return product;
}

export async function unpublishProduct(productId) {
  const product = await getProduct(productId);
  product.status = 'draft';
  await product.save();
  return product;
}

export async function archiveProduct(productId) {
  const product = await getProduct(productId);
  product.status = 'archived';
  await product.save();
  return product;
}

export async function duplicateProduct(productId) {
  const source = await getProduct(productId);
  const obj = source.toObject();
  delete obj._id;
  delete obj.createdAt;
  delete obj.updatedAt;
  const copy = await CatalogProduct.create({
    ...obj,
    name: `${obj.name} (copy)`,
    sku: `${obj.sku}-COPY-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    slug: `${obj.slug || slugify(obj.name)}-copy-${crypto.randomBytes(2).toString('hex')}`,
    status: 'draft',
    inventory: { ...obj.inventory, available: 0, reserved: 0 },
  });
  return getProduct(copy._id);
}

export async function addVariant(productId, variant) {
  const product = await getProduct(productId);
  if (variant.sku && product.variants.some((v) => v.sku === variant.sku)) {
    throw new ConflictError(`Variant SKU "${variant.sku}" already exists on this product`);
  }
  product.variants.push({ enabled: true, ...variant });
  await product.save();
  return product;
}

export async function updateVariant(productId, variantId, patch) {
  const product = await getProduct(productId);
  const variant = product.variants.id(variantId);
  if (!variant) throw new NotFoundError('Variant not found');
  Object.assign(variant, patch);
  await product.save();
  return product;
}

export async function addImages(productId, urls) {
  const product = await getProduct(productId);
  const url = urls[urls.length - 1];
  if (url) product.maskImageUrl = url;
  await product.save();
  return product;
}

const ROLE_IMAGE_FIELDS = {
  base: 'baseImageUrl',
  mask: 'maskImageUrl',
  base_back: 'baseBackImageUrl',
  mask_back: 'maskBackImageUrl',
  base_left: 'baseLeftImageUrl',
  mask_left: 'maskLeftImageUrl',
  base_right: 'baseRightImageUrl',
  mask_right: 'maskRightImageUrl',
};

/**
 * Set a production image by role.
 * Front: 'base' | 'mask'.
 * Back / left / right: 'base_*' | 'mask_*'.
 */
export async function setRoleImage(productId, role, url) {
  const product = await getProduct(productId);
  const field = ROLE_IMAGE_FIELDS[role];
  if (!field) {
    throw new ApiError(422, `Unknown image role "${role}"`, 'INVALID_IMAGE_ROLE');
  }
  if (role === 'mask') {
    // Legacy Shopify imports stored the marketing photo in maskImageUrl.
    // Preserve that photo in the marketing fields before replacing the mask.
    if (
      product.source?.provider === 'shopify'
      && !product.primaryImageUrl
      && !product.imageUrls?.length
      && product.maskImageUrl
    ) {
      product.primaryImageUrl = product.maskImageUrl;
      product.imageUrls = [product.maskImageUrl];
    }
  }
  product[field] = url;
  await product.save();
  return product;
}

export async function setCustomization(productId, customization) {
  const product = await getProduct(productId);
  product.customization = customization;
  await product.save();
  return product;
}

/** POD print-area placeholders. `printableAreas` (names) is derived from labels. */
export async function setPrintAreas(productId, printAreas, extras = {}) {
  const { normalizePlaceholder, resolvePhysical, physicalFrameForView, DEFAULT_DPI } = await import(
    '../../lib/printCoords.js'
  );
  const product = await getProduct(productId);
  if (extras.physicalDimensions) {
    product.physicalDimensions = {
      ...resolvePhysical(product.physicalDimensions),
      ...extras.physicalDimensions,
    };
  }
  if (extras.dpi != null) {
    product.dpi = Math.max(1, Math.round(Number(extras.dpi) || DEFAULT_DPI));
  }
  const phys = resolvePhysical(product.physicalDimensions);
  const productDpi = Math.max(1, Number(product.dpi) || DEFAULT_DPI);
  product.printAreas = (printAreas || []).map((a) => {
    const frame = physicalFrameForView(phys, a?.key);
    const n = normalizePlaceholder(a, frame);
    return {
      ...a,
      ...n,
      dpi: Math.max(1, Number(a?.dpi) || productDpi),
    };
  });
  product.printableAreas = product.printAreas.map((a) => a.label).filter(Boolean);
  await product.save();
  return product;
}

// ---- Categories ----

function categorySort(a, b) {
  const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (order !== 0) return order;
  return String(a.name).localeCompare(String(b.name));
}

function publicCategoryNode(doc) {
  return {
    _id: doc._id,
    name: doc.name,
    slug: doc.slug,
    sortOrder: doc.sortOrder ?? 0,
    description: doc.description || '',
  };
}

function nestCategoryTree(rows) {
  const childrenByParent = new Map();
  for (const row of rows) {
    if (!row.parentId) continue;
    const key = String(row.parentId);
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(row);
  }
  const withChildren = (row) => ({
    ...row,
    children: (childrenByParent.get(String(row._id)) || []).sort(categorySort).map(withChildren),
  });
  return rows.filter((row) => !row.parentId).sort(categorySort).map(withChildren);
}

/** Full tree. `parentId` returns that node's direct children. `roots` returns depth-0 rows only. */
export async function listCategories({ parentId, roots } = {}) {
  if (parentId) {
    return Category.find({ parentId }).sort({ sortOrder: 1, name: 1 }).lean();
  }
  if (roots) {
    return Category.find({ parentId: null }).sort({ sortOrder: 1, name: 1 }).lean();
  }
  const all = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  return nestCategoryTree(all);
}

/** Active tree for the public catalog. Kits stays a normal parent row; browse still special-cases it. */
export async function listPublicCategories() {
  const all = await Category.find({ status: 'active' }).sort({ sortOrder: 1, name: 1 }).lean();
  const childrenByParent = new Map();
  for (const row of all) {
    if (!row.parentId) continue;
    const key = String(row.parentId);
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(row);
  }
  return all
    .filter((row) => !row.parentId)
    .sort(categorySort)
    .map((parent) => ({
      ...publicCategoryNode(parent),
      children: (childrenByParent.get(String(parent._id)) || []).sort(categorySort).map(publicCategoryNode),
    }));
}

export async function createCategory({ name, description = '', parentId = null, sortOrder }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new ApiError(422, 'Category name is required', 'CATEGORY_REQUIRED');

  let parent = null;
  if (parentId) {
    parent = await Category.findById(parentId);
    if (!parent) throw new NotFoundError('Parent category not found');
  }

  const slug = slugify(trimmed);
  const scopeParentId = parent ? parent._id : null;
  const existing = await Category.findOne({
    parentId: scopeParentId,
    $or: [{ name: trimmed }, { slug }],
  });
  if (existing) throw new ConflictError('Category already exists');

  let order = sortOrder;
  if (order == null) {
    const last = await Category.findOne({ parentId: scopeParentId }).sort({ sortOrder: -1 }).select('sortOrder').lean();
    order = (last?.sortOrder ?? -1) + 1;
  }

  return Category.create({
    name: trimmed,
    slug,
    description,
    parentId: scopeParentId,
    depth: parent ? (parent.depth ?? 0) + 1 : 0,
    sortOrder: order,
    status: 'active',
  });
}

async function categoryNamePath(category) {
  const names = [category.name];
  let current = category;
  const seen = new Set([String(category._id)]);
  while (current.parentId) {
    const parent = await Category.findById(current.parentId).select('name parentId').lean();
    if (!parent || seen.has(String(parent._id))) break;
    seen.add(String(parent._id));
    names.unshift(parent.name);
    current = parent;
  }
  return names;
}

async function activeProductCount(category) {
  const path = await categoryNamePath(category);
  if (path.length === 1) {
    return CatalogProduct.countDocuments({ status: 'active', category: path[0] });
  }
  if (path.length === 2) {
    return CatalogProduct.countDocuments({ status: 'active', category: path[0], subcategory: path[1] });
  }
  return CatalogProduct.countDocuments({
    status: 'active',
    category: path[0],
    subcategory: path[1],
    childCategory: category.name,
  });
}

async function assertCanArchive(category) {
  const activeChildren = await Category.countDocuments({ parentId: category._id, status: 'active' });
  if (activeChildren) {
    throw new ConflictError('Archive child categories before archiving this parent');
  }
  const used = await activeProductCount(category);
  if (used) {
    throw new ConflictError(
      `${used} active product${used === 1 ? '' : 's'} still use "${category.name}". Reassign them before archiving.`,
    );
  }
}

async function renameProductLabels(category, oldName, newName) {
  if (oldName === newName) return;
  const path = await categoryNamePath({ ...category.toObject(), name: oldName });
  if (path.length === 1) {
    await CatalogProduct.updateMany({ category: oldName }, { $set: { category: newName } });
    return;
  }
  if (path.length === 2) {
    await CatalogProduct.updateMany(
      { category: path[0], subcategory: oldName },
      { $set: { subcategory: newName } },
    );
    return;
  }
  await CatalogProduct.updateMany(
    { category: path[0], subcategory: path[1], childCategory: oldName },
    { $set: { childCategory: newName } },
  );
}

export async function updateCategory(categoryId, patch) {
  const category = await Category.findById(categoryId);
  if (!category) throw new NotFoundError('Category not found');

  const nextName = patch.name !== undefined ? String(patch.name).trim() : category.name;
  if (patch.name !== undefined && !nextName) {
    throw new ApiError(422, 'Category name is required', 'CATEGORY_REQUIRED');
  }
  const nextStatus = patch.status || category.status;
  // Check the current name before any product relabel, so a rename cannot
  // archive a category that active products still use.
  if (nextStatus === 'archived' && category.status !== 'archived') {
    await assertCanArchive(category);
  }

  if (nextName !== category.name) {
    const slug = slugify(nextName);
    const dupe = await Category.findOne({
      _id: { $ne: category._id },
      parentId: category.parentId ?? null,
      $or: [{ name: nextName }, { slug }],
    });
    if (dupe) throw new ConflictError('Category already exists');
    const oldName = category.name;
    category.name = nextName;
    category.slug = slug;
    await renameProductLabels(category, oldName, nextName);
  }

  if (patch.description !== undefined) category.description = patch.description;
  if (patch.sortOrder !== undefined) category.sortOrder = patch.sortOrder;
  if (patch.status) category.status = patch.status;

  await category.save();
  return category;
}

/**
 * Category, subcategory, and child category stay strings on the product.
 * Subcategory must be an active child of the selected root.
 * childCategory is optional. When set, it must be an active child of that subcategory.
 */
export async function assertCatalogTaxonomy({ category, subcategory, childCategory }) {
  const categoryName = String(category || '').trim();
  if (!categoryName) throw new ApiError(422, 'Category must be selected', 'CATEGORY_REQUIRED');

  const parent = await Category.findOne({ name: categoryName, parentId: null, status: 'active' });
  if (!parent) {
    throw new ApiError(422, 'Category must be an active parent category', 'INVALID_CATEGORY');
  }

  const subName = String(subcategory || '').trim();
  const childCount = await Category.countDocuments({ parentId: parent._id, status: 'active' });
  if (!subName) {
    if (childCount > 0) {
      throw new ApiError(422, 'Subcategory must be selected', 'SUBCATEGORY_REQUIRED');
    }
    return;
  }

  const child = await Category.findOne({ name: subName, parentId: parent._id, status: 'active' });
  if (!child) {
    throw new ApiError(422, 'Subcategory must belong to the selected category', 'INVALID_SUBCATEGORY');
  }

  const leafName = String(childCategory || '').trim();
  if (!leafName) return;

  const leaf = await Category.findOne({ name: leafName, parentId: child._id, status: 'active' });
  if (!leaf) {
    throw new ApiError(422, 'Child category must belong to the selected subcategory', 'INVALID_CHILD_CATEGORY');
  }
}
