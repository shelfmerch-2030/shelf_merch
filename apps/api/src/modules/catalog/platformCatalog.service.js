import crypto from 'node:crypto';
import {
  CatalogProduct,
  INTERNAL_PRODUCT_FIELDS,
} from './catalogProduct.model.js';
import { Category } from './category.model.js';
import { ApiError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { getPagination, paginatedResponse } from '../../utils/pagination.js';

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
  const { page, limit, skip } = getPagination(query, { defaultLimit: 50 });
  const filter = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.search ? { name: { $regex: query.search, $options: 'i' } } : {}),
  };
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
  const before = platformProductDto(product);
  Object.assign(product, rest);
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
  product.variants.push(variant);
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

export async function listCategories() {
  return Category.find({}).sort({ name: 1 });
}

export async function createCategory({ name, description = '' }) {
  const slug = slugify(name);
  const existing = await Category.findOne({ $or: [{ name }, { slug }] });
  if (existing) throw new ConflictError('Category already exists');
  return Category.create({ name, slug, description });
}

export async function updateCategory(categoryId, patch) {
  const category = await Category.findByIdAndUpdate(categoryId, patch, { new: true });
  if (!category) throw new NotFoundError('Category not found');
  return category;
}
