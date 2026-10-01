import { Router } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import {
  resolveTenant,
  requireTenantContext,
  blockDuringImpersonation,
} from '../../../middleware/tenant.middleware.js';
import { tenantArea } from '../../../middleware/tenantAccess.middleware.js';
import { rateLimit } from '../../../middleware/rateLimit.middleware.js';
import { validate } from '../../../middleware/validate.middleware.js';
import {
  createLinkTokenBodySchema,
  exchangeTokenBodySchema,
  connectionIdParamsSchema,
} from './merge.validation.js';
import * as controller from './merge.controller.js';

const router = Router();

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

const mergeLinkTokenRateLimit = rateLimit([
  { prefix: 'merge:link-token:ip', limit: 30, windowSec: 15 * 60, key: clientIp, critical: true },
  {
    prefix: 'merge:link-token:user',
    limit: 20,
    windowSec: 15 * 60,
    key: (req) => req.user?.userId || clientIp(req),
    critical: true,
  },
]);

const mergeExchangeRateLimit = rateLimit([
  { prefix: 'merge:exchange:ip', limit: 30, windowSec: 15 * 60, key: clientIp, critical: true },
  {
    prefix: 'merge:exchange:user',
    limit: 20,
    windowSec: 15 * 60,
    key: (req) => req.user?.userId || clientIp(req),
    critical: true,
  },
]);

const mergeSyncRateLimit = rateLimit([
  { prefix: 'merge:sync:ip', limit: 20, windowSec: 15 * 60, key: clientIp, critical: true },
  {
    prefix: 'merge:sync:user',
    limit: 10,
    windowSec: 15 * 60,
    key: (req) => req.user?.userId || clientIp(req),
    critical: true,
  },
]);

const mergeDisconnectRateLimit = rateLimit([
  { prefix: 'merge:disconnect:ip', limit: 20, windowSec: 15 * 60, key: clientIp, critical: true },
  {
    prefix: 'merge:disconnect:user',
    limit: 10,
    windowSec: 15 * 60,
    key: (req) => req.user?.userId || clientIp(req),
    critical: true,
  },
]);

const adminWrite = [
  authenticate,
  resolveTenant,
  requireTenantContext,
  blockDuringImpersonation,
  tenantArea('integrations', 'write'),
];

const adminRead = [
  authenticate,
  resolveTenant,
  requireTenantContext,
  tenantArea('integrations', 'read'),
];

router.post(
  '/link-token',
  ...adminWrite,
  mergeLinkTokenRateLimit,
  validate({ body: createLinkTokenBodySchema }),
  asyncHandler(controller.createLinkToken),
);

router.post(
  '/exchange-token',
  ...adminWrite,
  mergeExchangeRateLimit,
  validate({ body: exchangeTokenBodySchema }),
  asyncHandler(controller.exchangeToken),
);

router.get('/connections', ...adminRead, asyncHandler(controller.listConnections));

router.post(
  '/connections/:connectionId/sync',
  ...adminWrite,
  mergeSyncRateLimit,
  validate({ params: connectionIdParamsSchema }),
  asyncHandler(controller.syncConnection),
);

router.post(
  '/connections/:connectionId/disconnect',
  ...adminWrite,
  mergeDisconnectRateLimit,
  validate({ params: connectionIdParamsSchema }),
  asyncHandler(controller.disconnectConnection),
);

router.get(
  '/connections/:connectionId/sync-runs',
  ...adminRead,
  validate({ params: connectionIdParamsSchema }),
  asyncHandler(controller.getConnectionSyncRuns),
);

router.get('/employees', ...adminRead, asyncHandler(controller.listEmployees));

export default router;
