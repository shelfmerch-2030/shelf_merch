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
import { PRODUCT_STATUSES, INVENTORY_MODES, CUSTOMIZATION_METHODS } from './catalogProduct.model.js';
import { INVENTORY_TXN_TYPES } from './inventoryTransaction.model.js';
import * as catalogService from './platformCatalog.service.js';
import * as inventoryService from './inventory.service.js';
import { importFromShopify } from './shopifyImport.service.js';

const upload = uploader({ allow: IMAGE_TYPES, maxSizeMb: 25, files: 8 });

const idParam = z.object({ id: objectId });

const createProductSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional().default(''),
  keyFeatures: z.string().optional().default(''),
  sizeGuide: z.string().optional().default(''),
  category: z.string().min(1),
  brand: z.string().optional().default(''),
  group: z.string().optional().default(''),
  sku: z.string().optional(),
  skuPrefix: z.string().optional(),
  sellingPriceInr: z.number().positive(),
  costPriceInr: z.number().nonnegative().optional().default(0),
  supplierName: z.string().optional().default(''),
  gstRate: z.number().min(0).max(28).optional().default(18),
  hsnCode: z.string().optional().default(''),
  moq: z.number().int().positive().optional().default(1),
  material: z.string().optional().default(''),
  printableAreas: z.array(z.string()).optional().default([]),
  customizationMethods: z.array(z.string()).optional().default([]),
  productionDays: z.number().int().positive().optional().default(7),
  physicalDimensions: z
    .object({
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      length: z.number().positive().optional(),
    })
    .optional(),
  dpi: z.number().int().positive().optional(),
});

const updateProductSchema = createProductSchema
  .partial()
  .extend({ reason: z.string().optional() });

const variantSchema = z.object({
  size: z.string().optional().default(''),
  color: z.string().optional().default(''),
  colorHex: z.string().optional().default(''),
  material: z.string().optional().default(''),
  sku: z.string().min(1),
  priceOverrideInr: z.number().positive().nullable().optional(),
  stock: z.number().int().nonnegative().optional().default(0),
  enabled: z.boolean().optional().default(true),
});

/** PATCH body — no defaults, so omitted fields are not wiped. */
const variantPatchSchema = z
  .object({
    size: z.string().optional(),
    color: z.string().optional(),
    colorHex: z.string().optional(),
    material: z.string().optional(),
    sku: z.string().min(1).optional(),
    priceOverrideInr: z.number().positive().nullable().optional(),
    stock: z.number().int().nonnegative().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

const customizationSchema = z.object({
  customization: z.array(
    z.object({
      method: z.enum(CUSTOMIZATION_METHODS),
      printableArea: z.string().optional().default(''),
      extraCostInr: z.number().nonnegative().optional().default(0),
    }),
  ),
});

const pct = z.number().min(0).max(100);
const inch = z.number().finite();
/** Treat 0 / negative / NaN as "unset" so legacy defaults don't fail `.positive()`. */
const positiveInch = z.preprocess(
  (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined),
  inch.positive().optional(),
);
const positiveScale = z.preprocess(
  (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined),
  z.number().positive().optional().default(1),
);
const printAreasSchema = z.object({
  physicalDimensions: z
    .object({
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      length: z.number().positive().optional(),
    })
    .optional(),
  dpi: z.number().int().positive().optional(),
  printAreas: z.array(
    z
      .object({
        key: z.string().optional().default(''),
        label: z.string().min(1),
        mockupImageUrl: z.string().optional().default(''),
        xIn: inch.optional(),
        yIn: inch.optional(),
        widthIn: positiveInch,
        heightIn: positiveInch,
        rotationDeg: z.number().optional().default(0),
        scale: positiveScale,
        lockSize: z.boolean().optional().default(false),
        shapeType: z.enum(['rect', 'polygon']).optional().default('rect'),
        polygonPoints: z.array(z.object({ xIn: inch, yIn: inch })).optional(),
        box: z
          .object({
            xPct: pct,
            yPct: pct,
            widthPct: pct,
            heightPct: pct,
          })
          .optional(),
        maxWidthCm: z.number().nonnegative().optional().default(0),
        maxHeightCm: z.number().nonnegative().optional().default(0),
        dpi: z.number().int().positive().optional().default(300),
        methods: z.array(z.enum(CUSTOMIZATION_METHODS)).optional().default([]),
      })
      .refine(
        (a) =>
          (typeof a.widthIn === 'number' && a.widthIn > 0 && typeof a.heightIn === 'number' && a.heightIn > 0)
          || (a.box && a.box.widthPct > 0 && a.box.heightPct > 0)
          || (a.maxWidthCm > 0 && a.maxHeightCm > 0),
        'print area needs inches, box %, or max cm size',
      ),
  ),
});

const listProductsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  category: z.string().optional(),
  search: z.string().optional(),
});

// ---- /api/v1/platform/products ----
export const platformProductsRouter = Router();
platformProductsRouter.use(authenticate, resolveTenant);

const catalogRead = platformArea('catalog', 'read');
const catalogWrite = platformArea('catalog', 'write');

platformProductsRouter.get(
  '/',
  catalogRead,
  validate({ query: listProductsQuery }),
  asyncHandler(async (req, res) => res.json(await catalogService.listProducts({ query: req.query }))),
);

platformProductsRouter.get(
  '/:id',
  catalogRead,
  validate({ params: idParam }),
  asyncHandler(async (req, res) =>
    res.json(catalogService.platformProductDto(await catalogService.getProduct(req.params.id))),
  ),
);

platformProductsRouter.post(
  '/',
  catalogWrite,
  validate({ body: createProductSchema }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.createProduct(req.body);
    writeAudit({ req, action: 'product.create', entityType: 'CatalogProduct', entityId: product._id, after: { name: product.name, sku: product.sku } });
    res.status(201).json(catalogService.platformProductDto(product));
  }),
);

platformProductsRouter.patch(
  '/:id',
  catalogWrite,
  validate({ params: idParam, body: updateProductSchema }),
  asyncHandler(async (req, res) => {
    const { reason, ...patch } = req.body;
    const { before, product, touchesSensitive } = await catalogService.updateProduct(
      req.params.id,
      patch,
      reason,
    );
    const after = catalogService.platformProductDto(product);
    writeAudit({
      req,
      action: touchesSensitive ? 'product.price_change' : 'product.update',
      entityType: 'CatalogProduct',
      entityId: product._id,
      before: { sellingPriceInr: before.sellingPriceInr, costPriceInr: before.costPriceInr, gstRate: before.gstRate, hsnCode: before.hsnCode },
      after: { sellingPriceInr: after.sellingPriceInr, costPriceInr: after.costPriceInr, gstRate: after.gstRate, hsnCode: after.hsnCode, reason },
    });
    res.json(after);
  }),
);

platformProductsRouter.post(
  '/import/shopify',
  catalogWrite,
  validate({
    body: z.object({
      domain: z.string().min(1),
      accessToken: z.string().min(1),
    }),
  }),
  asyncHandler(async (req, res) => {
    // Catalog import brings in catalog products only — kit bundles are imported
    // separately from the Kits page so the two stay sorted apart.
    const summary = await importFromShopify({ domain: req.body.domain, token: req.body.accessToken, only: 'products' });
    // Audit the import — never the access token.
    writeAudit({
      req,
      action: 'catalog.import.shopify',
      entityType: 'CatalogProduct',
      after: {
        domain: summary.domain,
        imported: summary.imported,
        updated: summary.updated,
        skipped: summary.skipped,
        failed: summary.failed,
      },
    });
    res.json(summary);
  }),
);

platformProductsRouter.post(
  '/:id/publish',
  catalogWrite,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.publishProduct(req.params.id);
    writeAudit({ req, action: 'product.publish', entityType: 'CatalogProduct', entityId: product._id });
    res.json(catalogService.platformProductDto(product));
  }),
);

platformProductsRouter.post(
  '/:id/unpublish',
  catalogWrite,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.unpublishProduct(req.params.id);
    writeAudit({ req, action: 'product.unpublish', entityType: 'CatalogProduct', entityId: product._id });
    res.json(catalogService.platformProductDto(product));
  }),
);

platformProductsRouter.post(
  '/:id/archive',
  catalogWrite,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.archiveProduct(req.params.id);
    writeAudit({ req, action: 'product.archive', entityType: 'CatalogProduct', entityId: product._id });
    res.json(catalogService.platformProductDto(product));
  }),
);

platformProductsRouter.post(
  '/:id/duplicate',
  catalogWrite,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.duplicateProduct(req.params.id);
    writeAudit({ req, action: 'product.duplicate', entityType: 'CatalogProduct', entityId: product._id });
    res.status(201).json(catalogService.platformProductDto(product));
  }),
);

platformProductsRouter.get(
  '/:id/variants',
  catalogRead,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.getProduct(req.params.id);
    res.json(product.variants);
  }),
);

platformProductsRouter.post(
  '/:id/variants',
  catalogWrite,
  validate({ params: idParam, body: variantSchema }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.addVariant(req.params.id, req.body);
    writeAudit({ req, action: 'product.variant_add', entityType: 'CatalogProduct', entityId: product._id, after: req.body });
    res.status(201).json(product.variants);
  }),
);

platformProductsRouter.patch(
  '/:id/variants/:variantId',
  catalogWrite,
  validate({ params: z.object({ id: objectId, variantId: objectId }), body: variantPatchSchema }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.updateVariant(req.params.id, req.params.variantId, req.body);
    writeAudit({ req, action: 'product.variant_update', entityType: 'CatalogProduct', entityId: product._id, after: req.body });
    res.json(product.variants);
  }),
);

platformProductsRouter.post(
  '/:id/images',
  catalogWrite,
  validate({ params: idParam }),
  upload.array('images', 8),
  asyncHandler(async (req, res) => {
    const files = req.files ?? [];
    const urls = [];
    for (const file of files) {
      const { url } = await uploadFile({ tenantId: 'platform', kind: 'product', file });
      urls.push(url);
    }
    // Also accept pre-uploaded URLs in the body for API-driven imports.
    if (Array.isArray(req.body?.urls)) urls.push(...req.body.urls);

    // role: front base|mask, or base_*/mask_* for back|left|right; otherwise mask image.
    const role = req.body?.role;
    const knownRoles = [
      'base',
      'mask',
      'base_back',
      'mask_back',
      'base_left',
      'mask_left',
      'base_right',
      'mask_right',
    ];
    if (knownRoles.includes(role) && urls[0]) {
      const product = await catalogService.setRoleImage(req.params.id, role, urls[0]);
      writeAudit({ req, action: 'product.images_add', entityType: 'CatalogProduct', entityId: product._id, after: { role, url: urls[0] } });
      return res.status(201).json({
        baseImageUrl: product.baseImageUrl,
        maskImageUrl: product.maskImageUrl,
        baseBackImageUrl: product.baseBackImageUrl,
        maskBackImageUrl: product.maskBackImageUrl,
        baseLeftImageUrl: product.baseLeftImageUrl,
        maskLeftImageUrl: product.maskLeftImageUrl,
        baseRightImageUrl: product.baseRightImageUrl,
        maskRightImageUrl: product.maskRightImageUrl,
      });
    }

    const product = await catalogService.addImages(req.params.id, urls);
    writeAudit({ req, action: 'product.images_add', entityType: 'CatalogProduct', entityId: product._id, after: { urls } });
    res.status(201).json({ maskImageUrl: product.maskImageUrl });
  }),
);

platformProductsRouter.get(
  '/:id/customization',
  catalogRead,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.getProduct(req.params.id);
    res.json(product.customization);
  }),
);

platformProductsRouter.post(
  '/:id/customization',
  catalogWrite,
  validate({ params: idParam, body: customizationSchema }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.setCustomization(req.params.id, req.body.customization);
    writeAudit({ req, action: 'product.customization_set', entityType: 'CatalogProduct', entityId: product._id, after: { customization: req.body.customization } });
    res.json(product.customization);
  }),
);

platformProductsRouter.get(
  '/:id/print-areas',
  catalogRead,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.getProduct(req.params.id);
    res.json(product.printAreas);
  }),
);

platformProductsRouter.put(
  '/:id/print-areas',
  catalogWrite,
  validate({ params: idParam, body: printAreasSchema }),
  asyncHandler(async (req, res) => {
    const product = await catalogService.setPrintAreas(req.params.id, req.body.printAreas, {
      physicalDimensions: req.body.physicalDimensions,
      dpi: req.body.dpi,
    });
    writeAudit({ req, action: 'product.print_areas_set', entityType: 'CatalogProduct', entityId: product._id, after: { count: product.printAreas.length } });
    res.json({
      printAreas: product.printAreas,
      physicalDimensions: product.physicalDimensions,
      dpi: product.dpi,
    });
  }),
);

// ---- /api/v1/platform/categories ----
export const platformCategoriesRouter = Router();
platformCategoriesRouter.use(authenticate, resolveTenant);

platformCategoriesRouter.get(
  '/',
  catalogRead,
  asyncHandler(async (_req, res) => res.json(await catalogService.listCategories())),
);
platformCategoriesRouter.post(
  '/',
  catalogWrite,
  validate({ body: z.object({ name: z.string().min(1), description: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const category = await catalogService.createCategory(req.body);
    writeAudit({ req, action: 'category.create', entityType: 'Category', entityId: category._id, after: { name: category.name } });
    res.status(201).json(category);
  }),
);
platformCategoriesRouter.patch(
  '/:id',
  catalogWrite,
  validate({
    params: idParam,
    body: z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      status: z.enum(['active', 'archived']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const category = await catalogService.updateCategory(req.params.id, req.body);
    writeAudit({ req, action: 'category.update', entityType: 'Category', entityId: category._id, after: req.body });
    res.json(category);
  }),
);

// ---- /api/v1/platform/inventory ----
export const platformInventoryRouter = Router();
platformInventoryRouter.use(authenticate, resolveTenant);

const inventoryRead = platformArea('inventory', 'read');
const inventoryWrite = platformArea('inventory', 'write');

platformInventoryRouter.get(
  '/',
  inventoryRead,
  validate({
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().optional(),
      mode: z.enum(INVENTORY_MODES).optional(),
      stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock', 'made_to_order']).optional(),
      search: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => res.json(await inventoryService.listInventory({ query: req.query }))),
);

platformInventoryRouter.get(
  '/:id/transactions',
  inventoryRead,
  validate({ params: idParam }),
  asyncHandler(async (req, res) =>
    res.json(await inventoryService.listInventoryTransactions(req.params.id, req.query)),
  ),
);

platformInventoryRouter.post(
  '/:id/transactions',
  inventoryWrite,
  validate({
    params: idParam,
    body: z.object({
      type: z.enum(INVENTORY_TXN_TYPES),
      qty: z.number().int(),
      reason: z.string().min(1),
      variantSku: z.string().optional(),
      relatedCampaignId: objectId.optional(),
      relatedOrderId: objectId.optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await inventoryService.applyInventoryTransaction({
      productId: req.params.id,
      ...req.body,
      performedBy: req.user.userId,
    });
    writeAudit({
      req,
      action: 'inventory.transaction',
      entityType: 'CatalogProduct',
      entityId: req.params.id,
      after: { type: req.body.type, qty: req.body.qty, reason: req.body.reason, ...result.inventory.toObject?.() ?? result.inventory },
    });
    res.status(201).json(result);
  }),
);

platformInventoryRouter.patch(
  '/:id/mode',
  inventoryWrite,
  validate({
    params: idParam,
    body: z.object({
      mode: z.enum(INVENTORY_MODES).optional(),
      lowStockThreshold: z.number().int().nonnegative().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const inventory = await inventoryService.setInventoryMode(req.params.id, req.body);
    writeAudit({ req, action: 'inventory.mode_set', entityType: 'CatalogProduct', entityId: req.params.id, after: req.body });
    res.json(inventory);
  }),
);
