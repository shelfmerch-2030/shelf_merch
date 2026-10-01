import crypto from 'node:crypto';
import {
  CatalogProduct,
  INTERNAL_PRODUCT_FIELDS,
} from './catalogProduct.model.js';
import { PlatformKit } from '../kits/platformKit.model.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { platformProductDto } from './platformCatalog.service.js';

async function uniqueSku(base) {
  let sku = base || `SM-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  while (await CatalogProduct.findOne({ sku })) {
    sku = `${base}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  }
  return sku;
}

function productImageUrls(product) {
  if (Array.isArray(product.imageUrls) && product.imageUrls.length) return product.imageUrls;
  if (product.primaryImageUrl) return [product.primaryImageUrl];
  return [];
}

/**
 * Move a catalog product into PlatformKit and persist kindOverride so Shopify
 * re-import keeps it classified as a kit.
 */
export async function moveProductToKit(productId) {
  const product = await CatalogProduct.findById(productId).select(INTERNAL_PRODUCT_FIELDS);
  if (!product) throw new NotFoundError('Product not found');
  if (product.source?.kindOverride === 'kit' && product.status === 'archived') {
    throw new ApiError(422, 'Product is already classified as a kit', 'ALREADY_KIT');
  }

  const provider = product.source?.provider || 'manual';
  const externalId = String(product.source?.externalId || '');
  const domain = product.source?.domain || '';
  const handle = product.source?.handle || '';

  let kit =
    provider === 'shopify' && externalId
      ? await PlatformKit.findOne({ 'source.provider': 'shopify', 'source.externalId': externalId })
      : null;

  const imageUrls = productImageUrls(product);
  const source = {
    provider,
    domain,
    externalId,
    handle,
    kindOverride: 'kit',
  };

  if (kit) {
    kit.name = product.name;
    kit.description = product.description || '';
    kit.imageUrls = imageUrls;
    kit.approxValueInr = product.basePriceInr || 0;
    kit.status = 'active';
    kit.source = { ...(kit.source?.toObject?.() ?? kit.source ?? {}), ...source };
    kit.markModified('source');
    await kit.save();
  } else {
    kit = await PlatformKit.create({
      name: product.name,
      description: product.description || '',
      packaging: 'box',
      approxValueInr: product.basePriceInr || 0,
      imageUrls,
      items: [],
      rules: {
        fixedComposition: true,
        customizationAllowed: true,
        requireLogo: true,
        minQtyPerRecipient: 1,
        maxQtyPerRecipient: 1,
      },
      status: 'active',
      source,
    });
  }

  if (!product.source) product.source = {};
  product.source.kindOverride = 'kit';
  product.source.provider = provider;
  if (externalId) product.source.externalId = externalId;
  product.status = 'archived';
  product.markModified('source');
  await product.save();

  return { product: platformProductDto(product), kit };
}

/**
 * Move a platform kit into CatalogProduct and persist kindOverride so Shopify
 * re-import keeps it classified as a catalog product.
 */
export async function moveKitToCatalog(kitId) {
  const kit = await PlatformKit.findById(kitId);
  if (!kit) throw new NotFoundError('Kit not found');
  if (kit.source?.kindOverride === 'catalog' && kit.status === 'archived') {
    throw new ApiError(422, 'Kit is already classified as a catalog product', 'ALREADY_CATALOG');
  }

  const provider = kit.source?.provider || 'manual';
  const externalId = String(kit.source?.externalId || '');
  const domain = kit.source?.domain || '';
  const handle = kit.source?.handle || '';

  let product =
    provider === 'shopify' && externalId
      ? await CatalogProduct.findOne({
          'source.provider': 'shopify',
          'source.externalId': externalId,
        }).select(INTERNAL_PRODUCT_FIELDS)
      : null;

  const source = {
    provider,
    domain,
    externalId,
    handle,
    kindOverride: 'catalog',
    categoryAssignedByAdmin: Boolean(product?.source?.categoryAssignedByAdmin),
  };

  if (product) {
    if (product.status === 'archived') product.status = 'draft';
    product.source = { ...(product.source?.toObject?.() ?? product.source ?? {}), ...source };
    product.markModified('source');
    await product.save();
  } else {
    const skuBase = externalId ? `SHOP-${externalId}` : `KIT-${String(kit._id).slice(-6)}`;
    const sku = await uniqueSku(skuBase);
    const imageUrls = Array.isArray(kit.imageUrls) ? kit.imageUrls : [];
    product = await CatalogProduct.create({
      sku,
      name: kit.name,
      description: kit.description || '',
      basePriceInr: kit.approxValueInr || 0,
      imageUrls,
      primaryImageUrl: kit.heroImage || imageUrls[0] || '',
      variants: [{ sku, stock: 0, enabled: true }],
      status: 'draft',
      inventory: { mode: 'made_to_order', available: 0, reserved: 0 },
      source,
    });
    product = await CatalogProduct.findById(product._id).select(INTERNAL_PRODUCT_FIELDS);
  }

  if (!kit.source) kit.source = {};
  kit.source.kindOverride = 'catalog';
  kit.source.provider = provider;
  if (externalId) kit.source.externalId = externalId;
  kit.status = 'archived';
  kit.markModified('source');
  await kit.save();

  return { kit, product: platformProductDto(product) };
}
