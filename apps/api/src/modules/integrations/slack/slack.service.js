import { env, slackRedirectUri } from '../../../config/env.js';
import { ApiError } from '../../../utils/errors.js';
import { logger } from '../../../config/logger.js';
import { encryptToken, decryptToken } from '../../../utils/tokenEncryption.js';
import {
  SLACK_BOT_SCOPES,
  SLACK_OAUTH_AUTHORIZE_URL,
  SLACK_OAUTH_ACCESS_URL,
  SLACK_CONVERSATIONS_LIST_URL,
  SLACK_CONVERSATIONS_INFO_URL,
  SLACK_CHAT_POST_MESSAGE_URL,
  SLACK_AUTH_REVOKE_URL,
  SLACK_TEST_MESSAGE,
} from './slack.constants.js';
import {
  SLACK_NOTIFICATION_PREFERENCE_KEYS,
  DEFAULT_SLACK_NOTIFICATIONS,
} from './slack.events.js';
import { SlackConnection } from './slackConnection.model.js';
import { generateOAuthState, storeOAuthState } from './slackOAuthState.service.js';
import { slackRequest, isSlackAuthErrorCode, requireSlackConfigured } from './slackHttp.js';

function activeStatuses() {
  return ['connected', 'needs_attention'];
}

export async function findActiveSlackConnection(tenantId) {
  return SlackConnection.findOne({
    tenantId,
    status: { $in: activeStatuses() },
  }).sort({ updatedAt: -1 });
}

async function requireActiveConnection(tenantId) {
  const connection = await findActiveSlackConnection(tenantId);
  if (!connection || !connection.encryptedBotToken) {
    throw new ApiError(404, 'Slack is not connected for this company', 'SLACK_NOT_CONNECTED');
  }
  return connection;
}

function decryptBotToken(connection) {
  try {
    return decryptToken(connection.encryptedBotToken);
  } catch {
    connection.status = 'needs_attention';
    connection.lastError = 'SLACK_TOKEN_DECRYPT_FAILED';
    connection.save().catch(() => {});
    throw new ApiError(
      502,
      'Could not decrypt Slack bot token — reconnect Slack',
      'SLACK_TOKEN_DECRYPT_FAILED',
    );
  }
}

async function markNeedsAttention(connection, code) {
  if (!connection) return;
  connection.status = 'needs_attention';
  connection.lastError = code;
  await connection.save();
}

/**
 * Start OAuth: store CSRF state bound to tenant+user, return authorize URL.
 */
export async function beginSlackConnect({ tenantId, userId }) {
  requireSlackConfigured();

  const state = generateOAuthState();
  await storeOAuthState(state, { tenantId, userId });

  const url = new URL(SLACK_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', SLACK_BOT_SCOPES.join(','));
  url.searchParams.set('redirect_uri', slackRedirectUri());
  url.searchParams.set('state', state);

  return { authorizeUrl: url.toString(), state };
}

/**
 * Exchange authorization code and upsert tenant-scoped SlackConnection.
 * Never logs code or access_token.
 */
export async function completeSlackOAuth({ code, tenantId, userId }) {
  requireSlackConfigured();

  if (!code || typeof code !== 'string') {
    throw new ApiError(400, 'Missing Slack authorization code', 'SLACK_MISSING_CODE');
  }

  const payload = await slackRequest(SLACK_OAUTH_ACCESS_URL, {
    method: 'POST',
    form: {
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: slackRedirectUri(),
    },
    logContext: { op: 'oauth.v2.access', tenantId: String(tenantId) },
  });

  const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : '';
  const teamId = payload?.team?.id;
  const teamName = payload?.team?.name || '';
  if (!accessToken || !teamId) {
    logger.warn({ tenantId: String(tenantId) }, 'Slack OAuth response missing token or team');
    throw new ApiError(502, 'Slack OAuth response was incomplete', 'SLACK_API_ERROR');
  }

  const encryptedBotToken = encryptToken(accessToken);
  const enterpriseId = payload?.enterprise?.id || '';
  const enterpriseName = payload?.enterprise?.name || '';
  const botUserId = payload?.bot_user_id || '';
  const installedBySlackUserId = payload?.authed_user?.id || '';

  const connection = await SlackConnection.findOneAndUpdate(
    { tenantId, teamId },
    {
      $set: {
        teamName,
        enterpriseId,
        enterpriseName,
        encryptedBotToken,
        botUserId,
        installedByUserId: userId,
        installedBySlackUserId,
        status: 'connected',
        connectedAt: new Date(),
        lastError: '',
      },
      $setOnInsert: {
        tenantId,
        teamId,
        defaultChannelId: '',
        defaultChannelName: '',
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return connection;
}

export async function getSlackConnectionPublic(tenantId) {
  const connection = await findActiveSlackConnection(tenantId);
  if (!connection) return null;
  return connection.toPublicJSON();
}

/**
 * List public channels the bot can see (paginated).
 */
export async function listSlackChannels(tenantId) {
  const connection = await requireActiveConnection(tenantId);
  const token = decryptBotToken(connection);
  const channels = [];
  let cursor;

  try {
    do {
      const payload = await slackRequest(SLACK_CONVERSATIONS_LIST_URL, {
        method: 'GET',
        token,
        query: {
          types: 'public_channel',
          exclude_archived: true,
          limit: 200,
          ...(cursor ? { cursor } : {}),
        },
        logContext: { op: 'conversations.list', tenantId: String(tenantId) },
      });

      const batch = Array.isArray(payload?.channels) ? payload.channels : [];
      for (const ch of batch) {
        if (!ch || typeof ch.id !== 'string') continue;
        channels.push({
          id: ch.id,
          name: typeof ch.name === 'string' ? ch.name : ch.id,
          is_private: Boolean(ch.is_private),
          is_member: Boolean(ch.is_member),
        });
      }
      cursor = payload?.response_metadata?.next_cursor || '';
    } while (cursor);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'SLACK_AUTH_FAILED') {
      await markNeedsAttention(connection, 'SLACK_AUTH_FAILED');
    }
    throw err;
  }

  channels.sort((a, b) => a.name.localeCompare(b.name));
  return channels;
}

export async function setDefaultSlackChannel(tenantId, channelId) {
  if (!channelId || typeof channelId !== 'string') {
    throw new ApiError(400, 'channelId is required', 'VALIDATION_ERROR');
  }

  const connection = await requireActiveConnection(tenantId);
  const token = decryptBotToken(connection);

  let channelName = '';
  try {
    const payload = await slackRequest(SLACK_CONVERSATIONS_INFO_URL, {
      method: 'GET',
      token,
      query: { channel: channelId },
      logContext: { op: 'conversations.info', tenantId: String(tenantId) },
    });
    const ch = payload?.channel;
    if (!ch?.id || ch.id !== channelId) {
      throw new ApiError(400, 'That Slack channel was not found', 'SLACK_CHANNEL_NOT_FOUND');
    }
    if (ch.is_archived) {
      throw new ApiError(400, 'That Slack channel is archived', 'SLACK_CHANNEL_NOT_FOUND');
    }
    channelName = typeof ch.name === 'string' ? ch.name : channelId;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'SLACK_AUTH_FAILED') {
      await markNeedsAttention(connection, 'SLACK_AUTH_FAILED');
    }
    throw err;
  }

  connection.defaultChannelId = channelId;
  connection.defaultChannelName = channelName;
  connection.lastError = '';
  await connection.save();
  return connection;
}

export async function sendSlackTestMessage(tenantId, channelId) {
  const connection = await requireActiveConnection(tenantId);
  const targetChannelId = channelId || connection.defaultChannelId;
  if (!targetChannelId) {
    throw new ApiError(
      400,
      'Select a default Slack channel before sending a test message',
      'SLACK_NO_DEFAULT_CHANNEL',
    );
  }

  const token = decryptBotToken(connection);

  try {
    const payload = await slackRequest(SLACK_CHAT_POST_MESSAGE_URL, {
      method: 'POST',
      token,
      body: {
        channel: targetChannelId,
        text: SLACK_TEST_MESSAGE,
      },
      logContext: { op: 'chat.postMessage', tenantId: String(tenantId) },
    });

    return {
      channelId: targetChannelId,
      channelName: connection.defaultChannelName || null,
      ts: payload?.ts || null,
    };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'SLACK_AUTH_FAILED') {
      await markNeedsAttention(connection, 'SLACK_AUTH_FAILED');
    }
    throw err;
  }
}

/**
 * Update Slack notification preferences (company-admin integrations write).
 */
export async function updateSlackNotifications(tenantId, preferences) {
  const connection = await requireActiveConnection(tenantId);
  if (!preferences || typeof preferences !== 'object') {
    throw new ApiError(400, 'Notification preferences are required', 'VALIDATION_ERROR');
  }

  const next = {
    ...DEFAULT_SLACK_NOTIFICATIONS,
    ...(connection.notifications?.toObject?.() || connection.notifications || {}),
  };

  for (const key of Object.keys(preferences)) {
    if (!SLACK_NOTIFICATION_PREFERENCE_KEYS.includes(key)) {
      throw new ApiError(400, `Unknown notification preference: ${key}`, 'VALIDATION_ERROR');
    }
    if (typeof preferences[key] !== 'boolean') {
      throw new ApiError(400, `Invalid preference: ${key}`, 'VALIDATION_ERROR');
    }
    next[key] = preferences[key];
  }

  connection.notifications = next;
  connection.notifyOrderDispatched = next.orderDispatched !== false;
  connection.lastError = '';
  await connection.save();
  return connection;
}

/**
 * Post a message to a tenant Slack channel (Phase 2+ notifications).
 * Accepts an optional preloaded connection to avoid a second DB lookup.
 */
export async function postSlackChannelMessage(
  tenantId,
  { channelId, text, blocks, connection: existingConnection } = {},
) {
  const connection = existingConnection || (await requireActiveConnection(tenantId));
  if (connection.status !== 'connected' || !connection.encryptedBotToken) {
    throw new ApiError(404, 'Slack is not connected for this company', 'SLACK_NOT_CONNECTED');
  }
  const targetChannelId = channelId || connection.defaultChannelId;
  if (!targetChannelId) {
    throw new ApiError(400, 'No Slack channel configured', 'SLACK_NO_DEFAULT_CHANNEL');
  }
  if (!text || typeof text !== 'string') {
    throw new ApiError(400, 'Slack message text is required', 'VALIDATION_ERROR');
  }

  const token = decryptBotToken(connection);
  const body = { channel: targetChannelId, text };
  if (Array.isArray(blocks) && blocks.length) body.blocks = blocks;

  try {
    const payload = await slackRequest(SLACK_CHAT_POST_MESSAGE_URL, {
      method: 'POST',
      token,
      body,
      logContext: { op: 'chat.postMessage', tenantId: String(tenantId) },
    });
    return {
      channelId: targetChannelId,
      ts: payload?.ts || null,
    };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'SLACK_AUTH_FAILED') {
      await markNeedsAttention(connection, 'SLACK_AUTH_FAILED');
    }
    throw err;
  }
}

/**
 * Disconnect: best-effort revoke + clear secrets. Idempotent.
 */
export async function disconnectSlack(tenantId) {
  const connection = await findActiveSlackConnection(tenantId);
  if (!connection) {
    return { disconnected: true, connection: null };
  }

  if (connection.encryptedBotToken) {
    try {
      const token = decryptToken(connection.encryptedBotToken);
      await slackRequest(SLACK_AUTH_REVOKE_URL, {
        method: 'POST',
        token,
        form: { token },
        logContext: { op: 'auth.revoke', tenantId: String(tenantId) },
        requireConfigured: false,
      });
    } catch (err) {
      // Revoke is best-effort; still clear local secrets.
      logger.warn(
        {
          tenantId: String(tenantId),
          code: err instanceof ApiError ? err.code : undefined,
        },
        'Slack token revoke skipped or failed',
      );
    }
  }

  connection.encryptedBotToken = '';
  connection.status = 'disconnected';
  connection.defaultChannelId = '';
  connection.defaultChannelName = '';
  connection.lastError = '';
  await connection.save();

  return { disconnected: true, connection: connection.toPublicJSON() };
}

export { isSlackAuthErrorCode };
