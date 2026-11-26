import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { NotFoundError } from '../../utils/errors.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { blockDuringImpersonation, requireTenantContext, resolveTenant } from '../../middleware/tenant.middleware.js';
import { tenantArea } from '../../middleware/tenantAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { CatalogProduct } from '../catalog/catalogProduct.model.js';
import { SkuMapping } from '../orderSources/skuMapping.model.js';
import { API_KEY_MODES, API_KEY_SCOPES } from './apiKey.model.js';
import { createApiKey, listApiKeys, revokeApiKey } from './apiKeys.service.js';
import * as webhooks from '../webhooks/webhooks.service.js';
import { WEBHOOK_EVENT_TYPES } from '../webhooks/webhooks.constants.js';
import { listImports } from '../catalogSync/catalogImport.service.js';
import { ImportedProduct } from '../catalogSync/catalogSync.models.js';

/**
 * /api/v1/developers — a tenant's self-serve API access: keys, webhook
 * endpoints and the tenant-wide SKU mappings the public Orders API resolves
 * against. Company admins only (even listing keys is sensitive).
 */
export const developersRouter = Router();
developersRouter.use(authenticate, resolveTenant, requireTenantContext, tenantArea('settings', 'write'));

// Catalog imports made through the public API (read-only here; imports happen over the API).
developersRouter.get(
  '/catalog-imports',
  asyncHandler(async (req, res) => {
    const [imports, importedCount] = await Promise.all([
      listImports({ tenantId: req.tenantId, query: { limit: 10 } }),
      ImportedProduct.countDocuments({ tenantId: req.tenantId, removedAt: null }),
    ]);
    res.json({ importedCount, imports: imports.data });
  }),
);

developersRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const base = String(env.APP_URL || '').replace(/\/+$/, '');
    res.json({ apiBaseUrl: `${base}/api/public/v1`, docsUrl: `${base}/docs/api`, scopes: API_KEY_SCOPES });
  }),
);

developersRouter.get(
  '/keys',
  validate({ query: z.object({ includeRevoked: z.enum(['true', 'false']).optional() }) }),
  asyncHandler(async (req, res) => {
    res.json({ items: await listApiKeys({ tenantId: req.tenantId, includeRevoked: req.query.includeRevoked === 'true' }) });
  }),
);

developersRouter.post(
  '/keys',
  blockDuringImpersonation,
  validate({
    body: z.object({
      name: z.string().trim().min(1).max(80),
      mode: z.enum(API_KEY_MODES),
      scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
      expiresAt: z.coerce.date().refine((d) => d > new Date(), 'Expiry must be in the future').optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await createApiKey({ tenantId: req.tenantId, userId: req.user.userId, ...req.body });
    writeAudit({ req, action: 'api_key.create', entityType: 'ApiKey', entityId: result.apiKey.id, after: { name: result.apiKey.name, mode: result.apiKey.mode, scopes: result.apiKey.scopes } });
    // `token` is returned exactly once.
    res.status(201).json(result);
  }),
);

developersRouter.delete(
  '/keys/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const apiKey = await revokeApiKey({ tenantId: req.tenantId, apiKeyId: req.params.id, userId: req.user.userId });
    writeAudit({ req, action: 'api_key.revoke', entityType: 'ApiKey', entityId: apiKey.id, after: { name: apiKey.name } });
    res.json(apiKey);
  }),
);

// ---- webhook endpoints ----

const endpointId = z.object({ id: objectId });
const eventsField = z.array(z.enum(WEBHOOK_EVENT_TYPES)).max(WEBHOOK_EVENT_TYPES.length);
const webhookUrl = z.string().trim().url().max(2000);

developersRouter.get(
  '/webhooks',
  asyncHandler(async (req, res) => {
    res.json({ items: await webhooks.listEndpoints({ tenantId: req.tenantId }), eventTypes: WEBHOOK_EVENT_TYPES });
  }),
);

developersRouter.post(
  '/webhooks',
  blockDuringImpersonation,
  validate({
    body: z.object({
      url: webhookUrl,
      mode: z.enum(['live', 'test']),
      events: eventsField.optional(),
      description: z.string().trim().max(200).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await webhooks.createEndpoint({ tenantId: req.tenantId, userId: req.user.userId, ...req.body });
    writeAudit({ req, action: 'webhook_endpoint.create', entityType: 'WebhookEndpoint', entityId: result.endpoint.id, after: { url: req.body.url, mode: req.body.mode } });
    res.status(201).json(result);
  }),
);

developersRouter.patch(
  '/webhooks/:id',
  validate({
    params: endpointId,
    body: z.object({
      url: webhookUrl.optional(),
      events: eventsField.optional(),
      description: z.string().trim().max(200).optional(),
      enabled: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const endpoint = await webhooks.updateEndpoint({ tenantId: req.tenantId, id: req.params.id, patch: req.body });
    writeAudit({ req, action: 'webhook_endpoint.update', entityType: 'WebhookEndpoint', entityId: endpoint.id, after: req.body });
    res.json(endpoint);
  }),
);

developersRouter.delete(
  '/webhooks/:id',
  validate({ params: endpointId }),
  asyncHandler(async (req, res) => {
    const result = await webhooks.deleteEndpoint({ tenantId: req.tenantId, id: req.params.id });
    writeAudit({ req, action: 'webhook_endpoint.delete', entityType: 'WebhookEndpoint', entityId: req.params.id });
    res.json(result);
  }),
);

developersRouter.post(
  '/webhooks/:id/reveal-secret',
  blockDuringImpersonation,
  validate({ params: endpointId }),
  asyncHandler(async (req, res) => {
    writeAudit({ req, action: 'webhook_endpoint.secret_revealed', entityType: 'WebhookEndpoint', entityId: req.params.id });
    res.set('Cache-Control', 'no-store');
    res.json(await webhooks.revealSecret({ tenantId: req.tenantId, id: req.params.id }));
  }),
);

developersRouter.post(
  '/webhooks/:id/rotate-secret',
  blockDuringImpersonation,
  validate({ params: endpointId }),
  asyncHandler(async (req, res) => {
    writeAudit({ req, action: 'webhook_endpoint.secret_rotated', entityType: 'WebhookEndpoint', entityId: req.params.id });
    res.set('Cache-Control', 'no-store');
    res.json(await webhooks.rotateSecret({ tenantId: req.tenantId, id: req.params.id }));
  }),
);

developersRouter.post(
  '/webhooks/:id/test',
  validate({ params: endpointId }),
  asyncHandler(async (req, res) => {
    res.json(await webhooks.sendTestEvent({ tenantId: req.tenantId, id: req.params.id }));
  }),
);

developersRouter.get(
  '/webhooks/:id/deliveries',
  validate({
    params: endpointId,
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json(await webhooks.listDeliveries({ tenantId: req.tenantId, endpointId: req.params.id, page: req.query.page, limit: req.query.limit }));
  }),
);

developersRouter.get(
  '/webhook-deliveries/:id',
  validate({ params: endpointId }),
  asyncHandler(async (req, res) => {
    res.json(await webhooks.getDeliveryPayload({ tenantId: req.tenantId, deliveryId: req.params.id }));
  }),
);

developersRouter.post(
  '/webhook-deliveries/:id/resend',
  validate({ params: endpointId }),
  asyncHandler(async (req, res) => {
    res.json(await webhooks.resendDelivery({ tenantId: req.tenantId, deliveryId: req.params.id }));
  }),
);

// ---- tenant-wide SKU mappings (client SKU → ShelfMerch product) ----

developersRouter.get(
  '/sku-mappings',
  asyncHandler(async (req, res) => {
    const rows = await SkuMapping.find({ tenantId: req.tenantId, connectionId: null }).sort({ externalSku: 1 }).lean();
    const ids = [...new Set(rows.map((r) => String(r.catalogProductId)))];
    const products = ids.length ? await CatalogProduct.find({ _id: { $in: ids } }).select('name sku').lean() : [];
    const byId = Object.fromEntries(products.map((p) => [String(p._id), p]));
    res.json({
      items: rows.map((r) => ({
        ...r,
        product: byId[String(r.catalogProductId)] ? { name: byId[String(r.catalogProductId)].name, sku: byId[String(r.catalogProductId)].sku } : null,
      })),
    });
  }),
);

developersRouter.put(
  '/sku-mappings',
  validate({
    body: z.object({
      externalSku: z.string().trim().min(1).max(120),
      catalogProductId: objectId,
      variant: z.object({ size: z.string().max(60).optional(), color: z.string().max(60).optional() }).optional(),
      artworkUrl: z.union([z.string().url().max(2000), z.literal('')]).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const product = await CatalogProduct.findOne({ _id: req.body.catalogProductId, status: 'active' }).select('_id').lean();
    if (!product) throw new NotFoundError('Catalog product not found');
    // Tenants cannot set their own price; unitPriceInr stays platform-controlled.
    const row = await SkuMapping.findOneAndUpdate(
      { tenantId: req.tenantId, connectionId: null, externalSku: req.body.externalSku },
      {
        $set: {
          catalogProductId: req.body.catalogProductId,
          variant: { size: req.body.variant?.size ?? '', color: req.body.variant?.color ?? '' },
          artworkUrl: req.body.artworkUrl ?? '',
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    writeAudit({ req, action: 'sku_mapping.upsert', entityType: 'SkuMapping', entityId: String(row._id), after: { externalSku: row.externalSku } });
    res.json(row);
  }),
);

developersRouter.delete(
  '/sku-mappings/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const r = await SkuMapping.deleteOne({ _id: req.params.id, tenantId: req.tenantId, connectionId: null });
    if (!r.deletedCount) throw new NotFoundError('SKU mapping not found');
    res.json({ deleted: true });
  }),
);
