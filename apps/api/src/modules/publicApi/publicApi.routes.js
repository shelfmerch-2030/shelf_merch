import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.middleware.js';
import { idempotency } from '../../middleware/idempotency.middleware.js';
import { rateLimit } from '../../middleware/rateLimit.middleware.js';
import { apiKeyAuth, requireApiScope } from '../apiKeys/apiKeyAuth.middleware.js';
import { publicApiErrorHandler, publicNotFound } from './publicApi.errors.js';
import { PUBLIC_ORDER_STATUSES } from './publicOrder.serializer.js';
import * as orders from './publicOrders.service.js';
import { listApiProducts } from './publicProducts.service.js';
import * as skuMappings from './publicSkuMappings.service.js';
import * as catalog from './publicCatalog.service.js';
import * as catalogImports from '../catalogSync/catalogImport.service.js';
import { writeAudit } from '../../services/audit.service.js';
import { buildOpenApi } from './openapi.js';

/**
 * ShelfMerch public API v1 — /api/public/v1
 * Clients authenticate with `Authorization: Bearer smk_live_…` / `smk_test_…`.
 * Breaking changes go to /v2; v1 only gets additive changes.
 */
export const publicApiRouter = Router();

publicApiRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('ShelfMerch-Api-Version', '1');
  next();
});

// The contract itself is public (no key needed) so clients can generate SDKs / import into Postman.
publicApiRouter.get('/openapi.json', (req, res) => {
  const origin = String(env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.set('Cache-Control', 'public, max-age=300');
  res.json(buildOpenApi(`${origin}/api/public/v1`));
});

publicApiRouter.use(apiKeyAuth);
publicApiRouter.use(
  rateLimit([
    // Per key: generous for normal checkout traffic, protects production from runaway loops.
    { prefix: 'public-api:key', limit: 120, windowSec: 60, key: (req) => String(req.apiKey._id), critical: true },
  ]),
);

const str = (max) => z.string().trim().min(1).max(max);
const optStr = (max) => z.string().trim().max(max).optional();
const orderId = z.object({ id: z.string().trim().min(1).max(40) });
const metadata = z
  .record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
  .refine((m) => Object.keys(m).length <= 20, 'metadata can have at most 20 keys');

const address = {
  name: str(120),
  phone: str(20),
  line1: str(200),
  line2: optStr(200),
  city: str(80),
  state: str(80),
  pincode: str(12),
  country: optStr(56),
};

const createOrderBody = z.object({
  external_id: z.string().trim().min(1).max(100).regex(/^[\w.:#/-]+$/, 'Use letters, digits and . _ : # / -'),
  customer: z.object({ name: optStr(120), email: z.string().trim().email().max(200).optional(), phone: optStr(20) }).optional(),
  shipping_address: z.object(address),
  items: z
    .array(
      z.object({
        // Exactly one of: sku (yours, a listing id or a ShelfMerch SKU), product_id (+ size/color), variant_id.
        sku: str(120).optional(),
        product_id: z.string().regex(/^[a-f\d]{24}$/i, 'product_id must be a catalog product id').optional(),
        variant_id: z.string().regex(/^[a-f\d]{24}$/i, 'variant_id must be a catalog variant id').optional(),
        quantity: z.number().int().min(1).max(10000),
        size: optStr(40),
        color: optStr(40),
        artwork_url: z.string().trim().url().max(2000).refine((u) => u.startsWith('https://'), 'artwork_url must be https').optional(),
        // Exact artwork size/position per print area, in inches relative to the area's top-left corner.
        print_areas: z
          .array(
            z
              .object({
                area: str(60),
                artwork_url: z.string().trim().url().max(2000).refine((u) => u.startsWith('https://'), 'artwork_url must be https'),
                width_in: z.number().positive().max(100),
                height_in: z.number().positive().max(100).optional(),
                left_in: z.number().min(0).max(100).optional(),
                top_in: z.number().min(0).max(100).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(10)
          .optional(),
      })
      .refine((i) => [i.sku, i.product_id, i.variant_id].filter(Boolean).length === 1, {
        message: 'Send exactly one of sku, product_id or variant_id',
        path: ['sku'],
      })
      .refine((i) => !(i.artwork_url && i.print_areas), {
        message: 'Send artwork per print area in print_areas[].artwork_url, not artwork_url as well',
        path: ['artwork_url'],
      }),
    )
    .min(1)
    .max(100),
  notes: optStr(1000),
  metadata: metadata.optional(),
});

const updateOrderBody = z
  .object({
    customer: z.object({ name: optStr(120), email: z.string().trim().email().max(200).optional(), phone: optStr(20) }).optional(),
    shipping_address: z.object(Object.fromEntries(Object.entries(address).map(([k, v]) => [k, v.optional()]))).optional(),
    notes: optStr(1000).nullable(),
    metadata: metadata.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Send at least one field to update');

// ---- products ----
publicApiRouter.get(
  '/products',
  requireApiScope('products:read'),
  validate({
    query: z.object({
      type: z.enum(['listing', 'mapped', 'catalog']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  asyncHandler(async (req, res) => res.json(await listApiProducts({ apiKey: req.apiKey, query: req.query }))),
);

// ---- catalog (import ShelfMerch's catalog into the client's platform and keep it in sync) ----
publicApiRouter.get(
  '/catalog/products',
  requireApiScope('catalog:read'),
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(250).default(100),
      cursor: optStr(200),
      updated_since: z.coerce.date().optional(),
      status: z.enum(['active', 'discontinued', 'all']).optional(),
      category: optStr(120),
      ids: optStr(2600),
      imported: z.enum(['true', 'false']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const importedIds = req.query.imported === 'true' ? await catalogImports.importedIdsFor(req.tenantId) : null;
    res.json(await catalog.listCatalogProducts({ query: req.query, importedIds }));
  }),
);

const objectIdStr = z.string().regex(/^[a-f\d]{24}$/i, 'must be a catalog product id');

publicApiRouter.post(
  '/catalog/imports',
  requireApiScope('catalog:import'),
  idempotency({ recover: true, matchRequest: true }),
  validate({
    body: z
      .object({
        all: z.literal(true).optional(),
        product_ids: z.array(z.string().trim().min(1).max(40)).min(1).max(catalogImports.MAX_IMPORT_IDS).optional(),
        category: optStr(120),
      })
      .strict()
      .refine((b) => Boolean(b.all) !== Boolean(b.product_ids), 'Send either "all": true or "product_ids"')
      .refine((b) => !b.category || b.all, { message: 'category can only be combined with "all": true', path: ['category'] }),
  }),
  asyncHandler(async (req, res) => {
    const result = await catalogImports.runImport({ apiKey: req.apiKey, body: req.body });
    writeAudit({ req, action: 'catalog.import', entityType: 'CatalogImport', entityId: result.id, after: { via: 'public_api', apiKeyId: req.user.apiKeyId, ...result.summary } });
    res.status(201).json(result);
  }),
);

publicApiRouter.get(
  '/catalog/imports',
  requireApiScope('catalog:read'),
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }) }),
  asyncHandler(async (req, res) => res.json(await catalogImports.listImports({ tenantId: req.tenantId, query: req.query }))),
);

publicApiRouter.get(
  '/catalog/imports/:id',
  requireApiScope('catalog:read'),
  validate({ params: z.object({ id: str(40) }) }),
  asyncHandler(async (req, res) => res.json(await catalogImports.getImport({ tenantId: req.tenantId, id: req.params.id }))),
);

publicApiRouter.get(
  '/catalog/imports/:id/items',
  requireApiScope('catalog:read'),
  validate({
    params: z.object({ id: str(40) }),
    query: z.object({
      result: z.string().regex(/^(imported|updated|skipped|failed)(,(imported|updated|skipped|failed))*$/).optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      starting_after: z.string().regex(/^\d+$/).optional(),
    }),
  }),
  asyncHandler(async (req, res) => res.json(await catalogImports.listImportItems({ tenantId: req.tenantId, id: req.params.id, query: req.query }))),
);

publicApiRouter.get(
  '/catalog/imported',
  requireApiScope('catalog:read'),
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(1000).default(100), starting_after: objectIdStr.optional() }) }),
  asyncHandler(async (req, res) => res.json(await catalogImports.listImported({ tenantId: req.tenantId, query: req.query }))),
);

publicApiRouter.delete(
  '/catalog/imported/:product_id',
  requireApiScope('catalog:import'),
  validate({ params: z.object({ product_id: objectIdStr }) }),
  asyncHandler(async (req, res) => res.json(await catalogImports.removeImported({ tenantId: req.tenantId, productId: req.params.product_id }))),
);

publicApiRouter.get(
  '/catalog/products/:id',
  requireApiScope('catalog:read'),
  validate({ params: z.object({ id: str(120) }) }),
  asyncHandler(async (req, res) => res.json(await catalog.getCatalogProduct({ id: req.params.id }))),
);

publicApiRouter.get(
  '/catalog/categories',
  requireApiScope('catalog:read'),
  asyncHandler(async (req, res) => res.json(await catalog.listCatalogCategories())),
);

// ---- SKU mappings (the client's SKUs → ShelfMerch products; shared by test and live keys) ----
const skuParams = z.object({ sku: skuMappings.skuParam });

publicApiRouter.get(
  '/sku-mappings',
  requireApiScope('sku_mappings:read'),
  validate({
    query: z.object({
      starting_after: optStr(120),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  asyncHandler(async (req, res) => res.json(await skuMappings.listSkuMappings({ tenantId: req.tenantId, query: req.query }))),
);

// Declared before /:sku so "bulk" is never read as a SKU.
publicApiRouter.post(
  '/sku-mappings/bulk',
  requireApiScope('sku_mappings:write'),
  idempotency({ recover: true, matchRequest: true }),
  validate({
    body: z.object({
      mappings: z.array(z.record(z.string(), z.unknown())).min(1).max(skuMappings.BULK_MAX),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await skuMappings.bulkSkuMappings({ tenantId: req.tenantId, rows: req.body.mappings });
    writeAudit({ req, action: 'sku_mapping.bulk_upsert', entityType: 'SkuMapping', after: { via: 'public_api', apiKeyId: req.user.apiKeyId, ...result.summary } });
    res.json(result);
  }),
);

publicApiRouter.get(
  '/sku-mappings/:sku',
  requireApiScope('sku_mappings:read'),
  validate({ params: skuParams }),
  asyncHandler(async (req, res) => res.json(await skuMappings.getSkuMapping({ tenantId: req.tenantId, sku: req.params.sku }))),
);

publicApiRouter.put(
  '/sku-mappings/:sku',
  requireApiScope('sku_mappings:write'),
  validate({ params: skuParams, body: skuMappings.mappingInput }),
  asyncHandler(async (req, res) => {
    const { result, mapping } = await skuMappings.putSkuMapping({ tenantId: req.tenantId, sku: req.params.sku, body: req.body });
    if (result !== 'unchanged') {
      writeAudit({ req, action: 'sku_mapping.upsert', entityType: 'SkuMapping', entityId: mapping.sku, after: { via: 'public_api', apiKeyId: req.user.apiKeyId, result, catalog_sku: mapping.catalog_sku } });
    }
    res.status(result === 'created' ? 201 : 200).json(mapping);
  }),
);

publicApiRouter.delete(
  '/sku-mappings/:sku',
  requireApiScope('sku_mappings:write'),
  validate({ params: skuParams }),
  asyncHandler(async (req, res) => {
    const out = await skuMappings.deleteSkuMapping({ tenantId: req.tenantId, sku: req.params.sku });
    writeAudit({ req, action: 'sku_mapping.delete', entityType: 'SkuMapping', entityId: out.sku, after: { via: 'public_api', apiKeyId: req.user.apiKeyId } });
    res.json(out);
  }),
);

// ---- orders ----
publicApiRouter.post(
  '/orders',
  requireApiScope('orders:write'),
  idempotency({ required: true, recover: true, matchRequest: true }),
  validate({ body: createOrderBody }),
  asyncHandler(async (req, res) => res.status(201).json(await orders.createApiOrder({ apiKey: req.apiKey, body: req.body }))),
);

publicApiRouter.get(
  '/orders',
  requireApiScope('orders:read'),
  validate({
    query: z.object({
      status: z.enum(PUBLIC_ORDER_STATUSES).optional(),
      external_id: optStr(100),
      updated_since: z.coerce.date().optional(),
      starting_after: z.string().regex(/^[a-f\d]{24}$/i, 'starting_after must be an order id').optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => res.json(await orders.listApiOrders({ apiKey: req.apiKey, query: req.query }))),
);

publicApiRouter.get(
  '/orders/:id',
  requireApiScope('orders:read'),
  validate({ params: orderId }),
  asyncHandler(async (req, res) => res.json(await orders.getApiOrder({ apiKey: req.apiKey, id: req.params.id }))),
);

publicApiRouter.patch(
  '/orders/:id',
  requireApiScope('orders:write'),
  idempotency({ recover: true, matchRequest: true }),
  validate({ params: orderId, body: updateOrderBody }),
  asyncHandler(async (req, res) => res.json(await orders.updateApiOrder({ apiKey: req.apiKey, id: req.params.id, body: req.body }))),
);

publicApiRouter.post(
  '/orders/:id/cancel',
  requireApiScope('orders:write'),
  idempotency({ recover: true, matchRequest: true }),
  validate({ params: orderId, body: z.object({ reason: optStr(500) }).optional().default({}) }),
  asyncHandler(async (req, res) =>
    res.json(await orders.cancelApiOrder({ apiKey: req.apiKey, id: req.params.id, reason: req.body?.reason })),
  ),
);

publicApiRouter.post(
  '/orders/:id/simulate',
  requireApiScope('orders:write'),
  validate({ params: orderId, body: z.object({ status: z.enum(['in_production', 'shipped', 'delivered']) }) }),
  asyncHandler(async (req, res) =>
    res.json(await orders.simulateApiOrder({ apiKey: req.apiKey, id: req.params.id, status: req.body.status })),
  ),
);

publicApiRouter.use(publicNotFound);
publicApiRouter.use(publicApiErrorHandler);
