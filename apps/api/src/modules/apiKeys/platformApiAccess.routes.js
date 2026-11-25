import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { NotFoundError } from '../../utils/errors.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant } from '../../middleware/tenant.middleware.js';
import { platformArea } from '../../middleware/platformAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { writeAudit } from '../../services/audit.service.js';
import { objectId } from '../users/users.validation.js';
import { Order } from '../orders/order.model.js';
import { ApiKey } from './apiKey.model.js';
import { listApiKeys, revokeApiKey } from './apiKeys.service.js';
import { WebhookEndpoint } from '../webhooks/webhook.models.js';
import { listEndpoints } from '../webhooks/webhooks.service.js';

/**
 * /api/v1/platform/api-access — ShelfMerch staff view of a tenant's public-API
 * access. Reading is open to platform roles; revoking/disabling is a
 * tenant-level security action, so it needs the tenants write area.
 */
export const platformApiAccessRouter = Router();
platformApiAccessRouter.use(authenticate, resolveTenant);

platformApiAccessRouter.get(
  '/',
  platformArea('tenants', 'read'),
  validate({ query: z.object({ tenantId: objectId }) }),
  asyncHandler(async (req, res) => {
    const tenantId = req.query.tenantId;
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [keys, endpoints, orders30d] = await Promise.all([
      listApiKeys({ tenantId, includeRevoked: true }),
      listEndpoints({ tenantId }),
      Order.countDocuments({ tenantId, source: 'api', testMode: false, createdAt: { $gte: since } }),
    ]);
    res.json({ keys, endpoints, liveApiOrdersLast30Days: orders30d });
  }),
);

platformApiAccessRouter.post(
  '/keys/:id/revoke',
  platformArea('tenants', 'write'),
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const key = await ApiKey.findOne({ _id: req.params.id }).setOptions({ skipTenantGuard: true }).select('tenantId').lean();
    if (!key) throw new NotFoundError('API key not found');
    const result = await revokeApiKey({ tenantId: key.tenantId, apiKeyId: req.params.id, userId: req.user.userId });
    writeAudit({ req, tenantId: key.tenantId, action: 'api_key.revoke_by_platform', entityType: 'ApiKey', entityId: result.id });
    res.json(result);
  }),
);

platformApiAccessRouter.post(
  '/webhooks/:id/disable',
  platformArea('tenants', 'write'),
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const ep = await WebhookEndpoint.findOne({ _id: req.params.id }).setOptions({ skipTenantGuard: true });
    if (!ep) throw new NotFoundError('Webhook endpoint not found');
    await WebhookEndpoint.updateOne(
      { _id: ep._id, tenantId: ep.tenantId },
      { $set: { enabled: false, disabledAt: new Date(), disabledReason: 'Disabled by ShelfMerch support' } },
    );
    writeAudit({ req, tenantId: ep.tenantId, action: 'webhook_endpoint.disable_by_platform', entityType: 'WebhookEndpoint', entityId: String(ep._id) });
    res.json({ disabled: true });
  }),
);
