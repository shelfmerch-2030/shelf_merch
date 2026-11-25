import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/errors.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireTenantContext, resolveTenant } from '../../middleware/tenant.middleware.js';
import { platformArea } from '../../middleware/platformAccess.middleware.js';
import { tenantArea } from '../../middleware/tenantAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { SPREADSHEET_TYPES, uploader } from '../../middleware/upload.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { parseCatalogFile } from './catalogMatch.sources.js';
import * as service from './catalogMatch.service.js';

const upload = uploader({ allow: SPREADSHEET_TYPES, maxSizeMb: 5 });
const idParams = z.object({ id: objectId });
const itemsQuery = z.object({
  status: z.string().regex(/^[a-z_,]+$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const acceptBody = z.object({
  catalogProductId: objectId.optional(),
  variant: z.object({ size: z.string().max(60).optional(), color: z.string().max(60).optional() }).nullable().optional(),
});

/**
 * Bulk catalog matching, mounted twice:
 *   /api/v1/platform/catalog-match — ShelfMerch ops, any tenant (tenantId in body/query), CSV or custom API
 *   /api/v1/developers/catalog-match — a tenant's company admins, tenant-wide mappings, CSV only
 * `scope(req)` returns { tenantId, connectionId? } for the request.
 */
function buildRouter({ readGuard, writeGuard, scope, allowApiSource }) {
  const router = Router();

  router.post(
    '/runs',
    writeGuard,
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const { tenantId, connectionId } = scope(req);
      const source = req.body?.source || (req.file ? 'csv' : 'custom_api');
      let run;
      if (source === 'csv') {
        if (!req.file) throw new ApiError(400, 'Attach a CSV or XLSX file as "file"', 'CATALOG_FILE_REQUIRED');
        const rows = parseCatalogFile(req.file.buffer, req.file.originalname);
        run = await service.runFromRows({ tenantId, connectionId, rows, fileName: req.file.originalname, userId: req.user.userId });
      } else if (source === 'custom_api' && allowApiSource) {
        if (!connectionId) throw new ApiError(400, 'connectionId is required to read a client API', 'CONNECTION_REQUIRED');
        run = await service.runFromConnection({ tenantId, connectionId, userId: req.user.userId });
      } else {
        throw new ApiError(400, `Unsupported source "${source}"`, 'CATALOG_SOURCE_UNSUPPORTED');
      }
      writeAudit({ req, tenantId, action: 'catalog_match.run', entityType: 'CatalogMatchRun', entityId: String(run._id), after: { source, counts: run.counts } });
      res.status(201).json(run);
    }),
  );

  if (allowApiSource) {
    // Client API connections whose catalog can be read (custom REST with a products endpoint configured).
    router.get(
      '/connections',
      readGuard,
      asyncHandler(async (req, res) => {
        res.json({ items: await service.listCatalogConnections({ tenantId: scope(req).tenantId }) });
      }),
    );
  }

  router.get(
    '/runs',
    readGuard,
    asyncHandler(async (req, res) => {
      const { tenantId, connectionId } = scope(req);
      res.json({ items: await service.listRuns({ tenantId, connectionId: connectionId || undefined }) });
    }),
  );

  router.get(
    '/runs/:id',
    readGuard,
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.getRun({ tenantId: scope(req).tenantId, runId: req.params.id }));
    }),
  );

  router.get(
    '/runs/:id/items',
    readGuard,
    validate({ params: idParams, query: itemsQuery }),
    asyncHandler(async (req, res) => {
      res.json(await service.listItems({ tenantId: scope(req).tenantId, runId: req.params.id, ...req.query }));
    }),
  );

  router.post(
    '/runs/:id/accept-suggestions',
    writeGuard,
    validate({ params: idParams, body: z.object({ minScore: z.number().min(0).max(1).optional() }).optional().default({}) }),
    asyncHandler(async (req, res) => {
      res.json(await service.acceptSuggestions({ tenantId: scope(req).tenantId, runId: req.params.id, minScore: req.body?.minScore, userId: req.user.userId }));
    }),
  );

  router.post(
    '/runs/:id/undo',
    writeGuard,
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      const result = await service.undoRun({ tenantId: scope(req).tenantId, runId: req.params.id });
      writeAudit({ req, tenantId: scope(req).tenantId, action: 'catalog_match.undo', entityType: 'CatalogMatchRun', entityId: req.params.id, after: result });
      res.json(result);
    }),
  );

  router.post(
    '/items/:id/accept',
    writeGuard,
    validate({ params: idParams, body: acceptBody.optional().default({}) }),
    asyncHandler(async (req, res) => {
      res.json(await service.acceptItem({ tenantId: scope(req).tenantId, itemId: req.params.id, ...req.body, userId: req.user.userId }));
    }),
  );

  router.post(
    '/items/:id/reject',
    writeGuard,
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      res.json(await service.rejectItem({ tenantId: scope(req).tenantId, itemId: req.params.id, userId: req.user.userId }));
    }),
  );

  return router;
}

const isObjectId = (v) => /^[a-f\d]{24}$/i.test(String(v ?? ''));

/** Ops: tenantId (+ optional connectionId) come from the query string or multipart body. */
function platformScope(req) {
  const tenantId = req.body?.tenantId || req.query.tenantId;
  const connectionId = req.body?.connectionId || req.query.connectionId || null;
  if (!isObjectId(tenantId)) throw new ApiError(400, 'tenantId is required', 'TENANT_REQUIRED');
  if (connectionId && !isObjectId(connectionId)) throw new ApiError(400, 'connectionId is invalid', 'VALIDATION_ERROR');
  return { tenantId, connectionId };
}

export const platformCatalogMatchRouter = Router();
platformCatalogMatchRouter.use(authenticate, resolveTenant);
platformCatalogMatchRouter.use(
  buildRouter({
    readGuard: platformArea('orders', 'read'),
    writeGuard: platformArea('orders', 'write'),
    scope: platformScope,
    allowApiSource: true,
  }),
);

/** Tenant: always its own tenant-wide mappings (the ones the public Orders API uses). */
export const tenantCatalogMatchRouter = Router();
tenantCatalogMatchRouter.use(authenticate, resolveTenant, requireTenantContext);
tenantCatalogMatchRouter.use(
  buildRouter({
    readGuard: tenantArea('settings', 'write'),
    writeGuard: tenantArea('settings', 'write'),
    scope: (req) => ({ tenantId: req.tenantId, connectionId: null }),
    allowApiSource: false,
  }),
);
