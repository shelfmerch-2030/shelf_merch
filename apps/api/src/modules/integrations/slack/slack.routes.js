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
import { defaultChannelBodySchema, testMessageBodySchema, notificationsBodySchema } from './slack.validation.js';
import * as controller from './slack.controller.js';

const router = Router();

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

const slackConnectRateLimit = rateLimit([
  { prefix: 'slack:connect:ip', limit: 30, windowSec: 15 * 60, key: clientIp, critical: true },
  {
    prefix: 'slack:connect:user',
    limit: 20,
    windowSec: 15 * 60,
    key: (req) => req.user?.userId || clientIp(req),
    critical: true,
  },
]);

const slackWriteRateLimit = rateLimit([
  { prefix: 'slack:write:ip', limit: 40, windowSec: 15 * 60, key: clientIp, critical: true },
  {
    prefix: 'slack:write:user',
    limit: 30,
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

/** OAuth start — returns authorizeUrl (frontend same-tab redirect). */
router.get('/connect', ...adminWrite, slackConnectRateLimit, asyncHandler(controller.connect));

/**
 * OAuth callback — public. CSRF + tenant binding via one-time state store.
 * Must stay outside JWT auth so Slack can redirect the browser here.
 */
router.get('/callback', asyncHandler(controller.callback));

router.get('/connection', ...adminRead, asyncHandler(controller.getConnection));

router.get('/channels', ...adminWrite, slackWriteRateLimit, asyncHandler(controller.listChannels));

router.put(
  '/default-channel',
  ...adminWrite,
  slackWriteRateLimit,
  validate({ body: defaultChannelBodySchema }),
  asyncHandler(controller.setDefaultChannel),
);

router.put(
  '/notifications',
  ...adminWrite,
  slackWriteRateLimit,
  validate({ body: notificationsBodySchema }),
  asyncHandler(controller.updateNotifications),
);

router.post(
  '/test-message',
  ...adminWrite,
  slackWriteRateLimit,
  validate({ body: testMessageBodySchema }),
  asyncHandler(controller.testMessage),
);

router.post(
  '/disconnect',
  ...adminWrite,
  slackWriteRateLimit,
  asyncHandler(controller.disconnect),
);

export default router;
