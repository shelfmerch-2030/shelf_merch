import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import {
  SLACK_INTEGRATIONS_CLIENT_PATH,
} from './slack.constants.js';
import { consumeOAuthState } from './slackOAuthState.service.js';
import {
  beginSlackConnect,
  completeSlackOAuth,
  getSlackConnectionPublic,
  listSlackChannels,
  setDefaultSlackChannel,
  sendSlackTestMessage,
  disconnectSlack,
  updateSlackNotifications,
} from './slack.service.js';

function clientRedirect(query) {
  const base = (env.BASE_URL || env.APP_URL || '').replace(/\/$/, '');
  const path = SLACK_INTEGRATIONS_CLIENT_PATH;
  const qs = new URLSearchParams(query).toString();
  return base ? `${base}${path}?${qs}` : `${path}?${qs}`;
}

export async function connect(req, res) {
  const { authorizeUrl } = await beginSlackConnect({
    tenantId: req.tenantId,
    userId: req.user.userId,
  });
  return res.json({ success: true, authorizeUrl });
}

/**
 * Public OAuth callback — secured by one-time state (tenant/user recovered from store).
 */
export async function callback(req, res) {
  const { code, state, error } = req.query;

  if (error === 'access_denied') {
    return res.redirect(302, clientRedirect({ slack: 'cancelled' }));
  }

  if (error) {
    logger.warn({ slackError: String(error) }, 'Slack OAuth callback error');
    return res.redirect(302, clientRedirect({ slack: 'error' }));
  }

  try {
    const record = await consumeOAuthState(typeof state === 'string' ? state : '');
    await completeSlackOAuth({
      code: typeof code === 'string' ? code : '',
      tenantId: record.tenantId,
      userId: record.userId,
    });
    return res.redirect(302, clientRedirect({ slack: 'connected' }));
  } catch (err) {
    const codeName = err instanceof ApiError ? err.code : 'SLACK_CALLBACK_FAILED';
    logger.warn(
      { code: codeName, message: err instanceof Error ? err.message : 'unknown' },
      'Slack OAuth callback failed',
    );
    return res.redirect(302, clientRedirect({ slack: 'error' }));
  }
}

export async function getConnection(req, res) {
  const connection = await getSlackConnectionPublic(req.tenantId);
  return res.json({ success: true, connection });
}

export async function listChannels(req, res) {
  const channels = await listSlackChannels(req.tenantId);
  return res.json({ success: true, channels });
}

export async function setDefaultChannel(req, res) {
  const connection = await setDefaultSlackChannel(req.tenantId, req.body.channelId);
  return res.json({ success: true, connection: connection.toPublicJSON() });
}

export async function testMessage(req, res) {
  const result = await sendSlackTestMessage(req.tenantId, req.body?.channelId);
  return res.json({ success: true, ...result });
}

export async function disconnect(req, res) {
  const result = await disconnectSlack(req.tenantId);
  return res.json({ success: true, ...result });
}

export async function updateNotifications(req, res) {
  const connection = await updateSlackNotifications(req.tenantId, req.body);
  return res.json({ success: true, connection: connection.toPublicJSON() });
}