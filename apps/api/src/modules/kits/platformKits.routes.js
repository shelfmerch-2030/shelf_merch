import { Router } from 'express';
import { z } from 'zod';
import { uploader, IMAGE_TYPES } from '../../middleware/upload.middleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant } from '../../middleware/tenant.middleware.js';
import { platformArea } from '../../middleware/platformAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { objectId } from '../users/users.validation.js';
import { uploadFile } from '../../services/storage.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { ApiError, NotFoundError } from '../../utils/errors.js';
import { PlatformKit } from './platformKit.model.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { importFromShopify } from '../catalog/shopifyImport.service.js';
import { moveKitToCatalog } from '../catalog/kindMove.service.js';
import { normalizeVariantImages, withNormalizedVariantImages } from './kitVariantImages.js';

const upload = uploader({ allow: IMAGE_TYPES, maxSizeMb: 25, files: 6 });

const idParam = z.object({ id: objectId });

const kitItemSchema = z.object({
  catalogProductId: objectId,
  variantSku: z.string().optional().default(''),
  qty: z.number().int().positive().optional().default(1),
});

const rulesSchema = z
  .object({
    fixedComposition: z.boolean(),
    customizationAllowed: z.boolean(),
    minQtyPerRecipient: z.number().int().positive(),
    maxQtyPerRecipient: z.number().int().positive(),
  })
  .partial();

const itemImageSchema = z.object({
  imageUrl: z.string().min(1),
  label: z.string().optional().default(''),
});

// PATCH schemas must not apply empty nested defaults — that wipes stored labels.
const itemImageUpdateSchema = z.object({
  imageUrl: z.string().min(1),
  label: z.string().optional(),
});

const variantImageUpdateSchema = z.object({
  imageUrl: z.string().min(1),
  label: z.string().optional(),
});

const imageRolesSchema = z.object({
  heroImage: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  itemImages: z.array(itemImageUpdateSchema).optional(),
  variantImages: z.array(variantImageUpdateSchema).optional(),
}).strict();

const createKitSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  packaging: z.enum(['none', 'box', 'premium_box']).optional().default('box'),
  eligibleCampaignTypes: z.array(z.string()).optional().default([]),
  approxValueInr: z.number().nonnegative().optional().default(0),
  imageUrls: z.array(z.string()).optional().default([]),
  heroImage: z.string().optional().default(''),
  galleryImages: z.array(z.string()).optional().default([]),
  itemImages: z.array(itemImageSchema).optional().default([]),
  variantImages: z.array(variantImageUpdateSchema).optional().default([]),
  rules: rulesSchema.optional(),
});

// Partial updates must NOT apply empty defaults — otherwise omitted fields like
// imageUrls get overwritten with [] and wipe uploaded gallery images.
const updateKitSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  packaging: z.enum(['none', 'box', 'premium_box']).optional(),
  eligibleCampaignTypes: z.array(z.string()).optional(),
  approxValueInr: z.number().nonnegative().optional(),
  imageUrls: z.array(z.string()).optional(),
  heroImage: z.string().optional(),
  galleryImages: z.array(z.string()).optional(),
  itemImages: z.array(itemImageUpdateSchema).optional(),
  variantImages: z.array(variantImageUpdateSchema).optional(),
  rules: rulesSchema.optional(),
  status: z.enum(['draft', 'archived']).optional(),
});

/** Build a $set payload that only updates image-role fields, never wiping stored values. */
function buildImageRolesSet(existing, body) {
  const $set = {};

  if (body.heroImage !== undefined) {
    const next = String(body.heroImage).trim();
    const current = String(existing.heroImage || '').trim();
    if (next || !current) $set.heroImage = next;
  }

  if (body.itemImages !== undefined) {
    const incoming = Array.isArray(body.itemImages) ? body.itemImages : [];
    const current = Array.isArray(existing.itemImages) ? existing.itemImages : [];
    if (!incoming.length && current.length) {
      // Ignore accidental empty payloads — do not wipe configured items.
    } else {
      const byUrl = new Map(current.map((it) => [String(it.imageUrl), it]));
      $set.itemImages = incoming.map((it) => ({
        imageUrl: it.imageUrl,
        label: String(it.label ?? '').trim() || String(byUrl.get(it.imageUrl)?.label ?? '').trim(),
      }));
    }
  }

  if (body.variantImages !== undefined) {
    const incoming = Array.isArray(body.variantImages) ? body.variantImages : [];
    const current = normalizeVariantImages(existing.variantImages);
    if (!incoming.length && current.length) {
      // Ignore accidental empty payloads — do not wipe configured variants.
    } else {
      const byUrl = new Map(current.map((it) => [String(it.imageUrl), it]));
      $set.variantImages = incoming.map((it) => ({
        imageUrl: it.imageUrl,
        label: String(it.label ?? '').trim() || String(byUrl.get(it.imageUrl)?.label ?? '').trim(),
      }));
    }
  }

  if (body.galleryImages !== undefined) {
    const incoming = Array.isArray(body.galleryImages) ? body.galleryImages : [];
    const current = Array.isArray(existing.galleryImages) ? existing.galleryImages : [];
    if (!incoming.length && current.length) {
      // Ignore accidental empty payloads — do not wipe configured gallery picks.
    } else {
      $set.galleryImages = incoming;
    }
  }

  return $set;
}

async function getKitDoc(id) {
  const kit = await PlatformKit.findById(id);
  if (!kit) throw new NotFoundError('Kit not found');
  return kit;
}

function kitImageUrlsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const norm = (u) =>
    String(u)
      .trim()
      .replace(/\\/g, '/')
      .replace(/^https?:\/\/[^/]+/i, '')
      .split('?')[0]
      .replace(/\/+$/, '');
  const na = norm(a);
  return Boolean(na) && na === norm(b);
}

function stripImageFromKit(kit, imageUrl) {
  const keep = (u) => !kitImageUrlsMatch(u, imageUrl);
  const beforeCount = kit.imageUrls?.length ?? 0;
  kit.imageUrls = (kit.imageUrls || []).filter(keep);
  if (kit.imageUrls.length === beforeCount) {
    throw new NotFoundError('Kit image not found');
  }
  kit.galleryImages = (kit.galleryImages || []).filter(keep);
  kit.itemImages = (kit.itemImages || []).filter((it) => keep(it.imageUrl));
  kit.variantImages = (kit.variantImages || []).filter((it) => keep(it.imageUrl));
  if (kitImageUrlsMatch(kit.heroImage, imageUrl)) {
    kit.heroImage = kit.imageUrls[0] || '';
  }
  kit.markModified('imageUrls');
  kit.markModified('galleryImages');
  kit.markModified('itemImages');
  kit.markModified('variantImages');
}

function serializeKit(kit) {
  const obj = kit?.toObject ? kit.toObject() : kit;
  return withNormalizedVariantImages(obj);
}

export const platformKitsRouter = Router();
platformKitsRouter.use(authenticate, resolveTenant);

const kitsRead = platformArea('kits', 'read');
const kitsWrite = platformArea('kits', 'write');

// Import only kit bundles from Shopify (catalog products are imported from the
// Catalog page) — keeps kits and catalog products sorted into separate flows.
platformKitsRouter.post(
  '/import/shopify',
  kitsWrite,
  validate({ body: z.object({ domain: z.string().min(1), accessToken: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const summary = await importFromShopify({ domain: req.body.domain, token: req.body.accessToken, only: 'kits' });
    writeAudit({
      req,
      action: 'kit.import.shopify',
      entityType: 'PlatformKit',
      after: { domain: summary.domain, kits: summary.kits, failed: summary.failed },
    });
    res.json(summary);
  }),
);

platformKitsRouter.get(
  '/',
  kitsRead,
  asyncHandler(async (req, res) => {
    // Default list hides archived kits (e.g. moved to catalog); pass ?status= to override.
    const filter = req.query.status ? { status: req.query.status } : { status: { $ne: 'archived' } };
    const kits = await PlatformKit.find(filter).sort({ createdAt: -1 }).lean();
    res.json(kits.map(withNormalizedVariantImages));
  }),
);

platformKitsRouter.get(
  '/:id',
  kitsRead,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => res.json(serializeKit(await getKitDoc(req.params.id)))),
);

platformKitsRouter.post(
  '/',
  kitsWrite,
  validate({ body: createKitSchema }),
  asyncHandler(async (req, res) => {
    const kit = await PlatformKit.create(req.body);
    writeAudit({ req, action: 'kit.create', entityType: 'PlatformKit', entityId: kit._id, after: { name: kit.name } });
    res.status(201).json(kit);
  }),
);

platformKitsRouter.patch(
  '/:id',
  kitsWrite,
  validate({ params: idParam, body: updateKitSchema }),
  asyncHandler(async (req, res) => {
    const kit = await getKitDoc(req.params.id);
    const before = kit.toObject();
    // Assign only keys present on the validated body (no implicit empties).
    for (const [key, value] of Object.entries(req.body || {})) {
      if (value === undefined) continue;
      // Never wipe existing text/content with an empty PATCH payload.
      if (key === 'description' && !String(value).trim() && String(kit.description || '').trim()) continue;
      if (key === 'heroImage' && !String(value).trim() && String(kit.heroImage || '').trim()) continue;
      if (key === 'imageUrls' && Array.isArray(value) && !value.length && (kit.imageUrls?.length ?? 0) > 0) continue;
      if (key === 'itemImages' && Array.isArray(value) && !value.length && (kit.itemImages?.length ?? 0) > 0) continue;
      if (key === 'variantImages' && Array.isArray(value) && !value.length && (kit.variantImages?.length ?? 0) > 0) continue;
      if (key === 'galleryImages' && Array.isArray(value) && !value.length && (kit.galleryImages?.length ?? 0) > 0) continue;
      kit[key] = value;
    }
    await kit.save();
    writeAudit({ req, action: 'kit.update', entityType: 'PlatformKit', entityId: kit._id, before: { name: before.name, status: before.status, approxValueInr: before.approxValueInr, imageUrlsCount: before.imageUrls?.length }, after: req.body });
    res.json(serializeKit(kit));
  }),
);

// Image-role updates touch ONLY heroImage / galleryImages / itemImages / variantImages — nothing else.
platformKitsRouter.patch(
  '/:id/image-roles',
  kitsWrite,
  validate({ params: idParam, body: imageRolesSchema }),
  asyncHandler(async (req, res) => {
    const kit = await getKitDoc(req.params.id);
    const before = {
      heroImage: kit.heroImage,
      itemImagesCount: kit.itemImages?.length ?? 0,
      galleryImagesCount: kit.galleryImages?.length ?? 0,
      variantImagesCount: kit.variantImages?.length ?? 0,
    };
    const $set = buildImageRolesSet(kit.toObject(), req.body);
    if (!Object.keys($set).length) {
      return res.json(serializeKit(kit));
    }
    $set.updatedAt = new Date();
    const updated = await PlatformKit.findByIdAndUpdate(
      kit._id,
      { $set },
      { new: true, runValidators: true },
    ).lean();
    writeAudit({
      req,
      action: 'kit.image_roles_update',
      entityType: 'PlatformKit',
      entityId: kit._id,
      before,
      after: $set,
    });
    res.json(withNormalizedVariantImages(updated));
  }),
);

platformKitsRouter.post(
  '/:id/items',
  kitsWrite,
  validate({ params: idParam, body: kitItemSchema }),
  asyncHandler(async (req, res) => {
    const kit = await getKitDoc(req.params.id);
    const product = await CatalogProduct.findById(req.body.catalogProductId);
    if (!product) throw new NotFoundError('Catalog product not found');
    kit.items.push(req.body);
    await kit.save();
    writeAudit({ req, action: 'kit.item_add', entityType: 'PlatformKit', entityId: kit._id, after: req.body });
    res.status(201).json(kit.items);
  }),
);

platformKitsRouter.post(
  '/:id/images',
  kitsWrite,
  validate({ params: idParam }),
  upload.array('images', 6),
  asyncHandler(async (req, res) => {
    const kit = await getKitDoc(req.params.id);
    const urls = [];
    for (const file of req.files ?? []) {
      const { url } = await uploadFile({ tenantId: 'platform', kind: 'product', file });
      urls.push(url);
    }
    if (Array.isArray(req.body?.urls)) urls.push(...req.body.urls);
    kit.imageUrls.push(...urls);
    await kit.save();
    writeAudit({ req, action: 'kit.images_add', entityType: 'PlatformKit', entityId: kit._id, after: { urls } });
    res.status(201).json({ imageUrls: kit.imageUrls });
  }),
);

platformKitsRouter.delete(
  '/:id/images',
  kitsWrite,
  validate({ params: idParam, body: z.object({ imageUrl: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const kit = await getKitDoc(req.params.id);
    const imageUrl = String(req.body.imageUrl).trim();
    stripImageFromKit(kit, imageUrl);
    await kit.save();
    writeAudit({
      req,
      action: 'kit.images_remove',
      entityType: 'PlatformKit',
      entityId: kit._id,
      after: { imageUrl },
    });
    res.json(serializeKit(kit));
  }),
);

platformKitsRouter.delete(
  '/:id/items/:itemId',
  kitsWrite,
  validate({ params: z.object({ id: objectId, itemId: objectId }) }),
  asyncHandler(async (req, res) => {
    const kit = await getKitDoc(req.params.id);
    const item = kit.items.id(req.params.itemId);
    if (!item) throw new NotFoundError('Kit item not found');
    item.deleteOne();
    await kit.save();
    writeAudit({ req, action: 'kit.item_remove', entityType: 'PlatformKit', entityId: kit._id, after: { itemId: req.params.itemId } });
    res.json(kit.items);
  }),
);

platformKitsRouter.post(
  '/:id/publish',
  kitsWrite,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const kit = await getKitDoc(req.params.id);
    // Imported (e.g. Shopify) kits are curated, self-contained bundles with no
    // component items to compose — only manually-built kits need items.
    const imported = kit.source?.provider && kit.source.provider !== 'manual';
    if (!imported && !kit.items.length) {
      throw new ApiError(422, 'A kit needs at least one item before publishing', 'KIT_EMPTY');
    }
    if ((kit.imageUrls?.length ?? 0) > 0 && !String(kit.heroImage || '').trim()) {
      throw new ApiError(422, 'Select a hero image before publishing', 'KIT_HERO_REQUIRED');
    }
    kit.status = 'active';
    await kit.save();
    writeAudit({ req, action: 'kit.publish', entityType: 'PlatformKit', entityId: kit._id });
    res.json(serializeKit(kit));
  }),
);

platformKitsRouter.post(
  '/:id/move-to-catalog',
  kitsWrite,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const result = await moveKitToCatalog(req.params.id);
    writeAudit({
      req,
      action: 'kit.move_to_catalog',
      entityType: 'PlatformKit',
      entityId: result.kit._id,
      after: { productId: result.product._id, kindOverride: 'catalog' },
    });
    res.json(result);
  }),
);
