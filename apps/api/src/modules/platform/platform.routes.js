import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { resolveTenant, blockDuringImpersonation } from '../../middleware/tenant.middleware.js';
import { platformArea } from '../../middleware/platformAccess.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { ForbiddenError } from '../../utils/errors.js';
import * as controller from './platform.controller.js';
import {
  listPlatformOrdersQuery,
  orderIdParam,
  updateOrderStatusSchema,
  assignVendorSchema,
  orderNoteSchema,
  orderMockupSchema,
  replacementSchema,
  createProductionTaskSchema,
  listProductionTasksQuery,
  updateTaskStatusSchema,
  qcSchema,
  updateTaskSchema,
  listAuditLogsQuery,
  inviteTeamSchema,
  changeTeamRoleSchema,
  teamUserIdParam,
  settingKeyParam,
  putSettingSchema,
} from './platform.validation.js';

// ---- /api/v1/platform/dashboard (§2) ----
export const platformDashboardRouter = Router();
platformDashboardRouter.use(authenticate, resolveTenant, platformArea('dashboard', 'read'));
platformDashboardRouter.get('/', asyncHandler(controller.dashboard));

// ---- /api/v1/platform/orders (§3.5) ----
export const platformOrdersRouter = Router();
platformOrdersRouter.use(authenticate, resolveTenant);

const ordersRead = platformArea('orders', 'read');
const ordersWrite = platformArea('orders', 'write');

platformOrdersRouter.get(
  '/',
  ordersRead,
  validate({ query: listPlatformOrdersQuery }),
  asyncHandler(controller.listOrders),
);
platformOrdersRouter.get(
  '/:id',
  ordersRead,
  validate({ params: orderIdParam }),
  asyncHandler(controller.getOrder),
);
platformOrdersRouter.patch(
  '/:id/status',
  ordersWrite,
  validate({ params: orderIdParam, body: updateOrderStatusSchema }),
  asyncHandler(controller.updateOrderStatus),
);
platformOrdersRouter.patch(
  '/:id/assign-vendor',
  ordersWrite,
  validate({ params: orderIdParam, body: assignVendorSchema }),
  asyncHandler(controller.assignVendor),
);
platformOrdersRouter.post(
  '/:id/notes',
  ordersWrite,
  validate({ params: orderIdParam, body: orderNoteSchema }),
  asyncHandler(controller.addOrderNote),
);
platformOrdersRouter.post(
  '/:id/mockup',
  ordersWrite,
  validate({ params: orderIdParam, body: orderMockupSchema }),
  asyncHandler(controller.uploadOrderMockup),
);
platformOrdersRouter.post(
  '/:id/replacement',
  ordersWrite,
  validate({ params: orderIdParam, body: replacementSchema }),
  asyncHandler(controller.createReplacement),
);

// ---- /api/v1/platform/production (§3.6) ----
export const platformProductionRouter = Router();
platformProductionRouter.use(authenticate, resolveTenant);

const productionRead = platformArea('production', 'read');
const productionWrite = platformArea('production', 'write');

platformProductionRouter.get('/', productionRead, asyncHandler(controller.productionBoard));
platformProductionRouter.get(
  '/tasks',
  productionRead,
  validate({ query: listProductionTasksQuery }),
  asyncHandler(controller.listProductionTasks),
);
platformProductionRouter.post(
  '/tasks',
  productionWrite,
  validate({ body: createProductionTaskSchema }),
  asyncHandler(controller.createProductionTask),
);
platformProductionRouter.patch(
  '/tasks/:id/status',
  productionWrite,
  validate({ params: orderIdParam, body: updateTaskStatusSchema }),
  asyncHandler(controller.updateProductionTaskStatus),
);
platformProductionRouter.post(
  '/tasks/:id/qc',
  productionWrite,
  validate({ params: orderIdParam, body: qcSchema }),
  asyncHandler(controller.recordQc),
);
platformProductionRouter.patch(
  '/tasks/:id',
  productionWrite,
  validate({ params: orderIdParam, body: updateTaskSchema }),
  asyncHandler(controller.updateProductionTask),
);

// ---- /api/v1/platform/audit-logs (§6) ----
export const platformAuditRouter = Router();
platformAuditRouter.use(authenticate, resolveTenant, platformArea('auditLogs', 'read'));
platformAuditRouter.get(
  '/',
  validate({ query: listAuditLogsQuery }),
  asyncHandler(controller.listAuditLogs),
);

// ---- /api/v1/platform/impersonate (§4) ----
export const platformImpersonateRouter = Router();
platformImpersonateRouter.use(authenticate, resolveTenant);
platformImpersonateRouter.post(
  '/end',
  (req, _res, next) => {
    if (!req.impersonation?.isImpersonating) {
      return next(new ForbiddenError('Not currently impersonating'));
    }
    next();
  },
  asyncHandler(controller.endImpersonation),
);

// ---- /api/v1/platform/team (§5) ----
export const platformTeamRouter = Router();
platformTeamRouter.use(authenticate, resolveTenant);

const teamRead = platformArea('team', 'read');
// §4 / non-negotiable #7 — role changes are blocked during impersonation.
const teamWrite = [platformArea('team', 'write'), blockDuringImpersonation];

platformTeamRouter.get('/', teamRead, asyncHandler(controller.listTeam));
platformTeamRouter.post(
  '/',
  ...teamWrite,
  validate({ body: inviteTeamSchema }),
  asyncHandler(controller.inviteTeamMember),
);
platformTeamRouter.patch(
  '/:userId',
  ...teamWrite,
  validate({ params: teamUserIdParam, body: changeTeamRoleSchema }),
  asyncHandler(controller.changeTeamRole),
);
platformTeamRouter.post(
  '/:userId/deactivate',
  ...teamWrite,
  validate({ params: teamUserIdParam }),
  asyncHandler(controller.deactivateTeamMember),
);
platformTeamRouter.post(
  '/:userId/reactivate',
  ...teamWrite,
  validate({ params: teamUserIdParam }),
  asyncHandler(controller.reactivateTeamMember),
);
platformTeamRouter.get(
  '/:userId/activity',
  teamRead,
  validate({ params: teamUserIdParam }),
  asyncHandler(controller.teamMemberActivity),
);

// ---- /api/v1/platform/settings (§6) ----
export const platformSettingsRouter = Router();
platformSettingsRouter.use(authenticate, resolveTenant);

platformSettingsRouter.get('/', platformArea('settings', 'read'), asyncHandler(controller.getSettings));
platformSettingsRouter.get(
  '/demo-login-password',
  platformArea('settings', 'read'),
  asyncHandler(controller.getDemoLoginPassword),
);
platformSettingsRouter.post(
  '/demo-login-password',
  platformArea('settings', 'write'),
  blockDuringImpersonation,
  asyncHandler(controller.generateDemoLoginPassword),
);
platformSettingsRouter.delete(
  '/demo-login-password',
  platformArea('settings', 'write'),
  blockDuringImpersonation,
  asyncHandler(controller.revokeDemoLoginPassword),
);
platformSettingsRouter.get(
  '/:key',
  platformArea('settings', 'read'),
  validate({ params: settingKeyParam }),
  asyncHandler(controller.getSetting),
);
platformSettingsRouter.put(
  '/:key',
  platformArea('settings', 'write'),
  blockDuringImpersonation,
  validate({ params: settingKeyParam, body: putSettingSchema }),
  asyncHandler(controller.putSetting),
);
