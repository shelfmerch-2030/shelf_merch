import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, requireTenantContext } from '../../middleware/tenant.middleware.js';
import { tenantArea } from '../../middleware/tenantAccess.middleware.js';
import { requireScope } from '../../middleware/abac.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { Order } from './order.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import * as controller from './orders.controller.js';
import { listOrdersQuery, orderIdParams, updateOrderStatusSchema } from './orders.validation.js';

const router = Router();

router.use(authenticate, resolveTenant, requireTenantContext);

const canRead = tenantArea('orders', 'read');
const canUpdate = tenantArea('orders', 'write');

const entityScope = requireScope(async (req) => {
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenantId }).select('campaignId');
  if (!order?.campaignId) return null; // external orders: assertOrderAccess denies entity users
  const campaign = await Campaign.findOne({ _id: order.campaignId, tenantId: req.tenantId }).select('entityId');
  return campaign?.entityId ?? null;
});

router.get('/', canRead, validate({ query: listOrdersQuery }), asyncHandler(controller.list));

router.get(
  '/:id',
  canRead,
  entityScope,
  validate({ params: orderIdParams }),
  asyncHandler(controller.getOne),
);

router.patch(
  '/:id/status',
  canUpdate,
  validate({ params: orderIdParams, body: updateOrderStatusSchema }),
  asyncHandler(controller.updateStatus),
);

export default router;
